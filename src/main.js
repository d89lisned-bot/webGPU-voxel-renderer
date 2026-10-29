import {vec3, mat3, vec4, mat4} from 'wgpu-matrix';
import Stats from 'stats.js'

alert("hi")

var stats = new Stats();

stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild( stats.dom );


export function createFPSCamera(canvas,near = 1.0, maxDis = 40, userControlled = false, speed = 5, sensitivity = 0.002) {

  const position = vec3.create(0, 1.5, -20);
  let yaw = 0;
  let pitch = 0;

  const keys = {};
  const view = mat4.identity();
  const viewPrev = mat4.identity();
  let projection = mat4.perspective(Math.PI / 4,
    canvas.width / canvas.height,
    near,
    maxDis)

  // pointer lock
  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  // keyboard
  window.addEventListener("keydown", e => keys[e.code] = true);
  window.addEventListener("keyup", e => keys[e.code] = false);


 
  // mouse movement
  window.addEventListener("mousemove", e => {
    if (document.pointerLockElement !== canvas) return;

    if(userControlled){

    yaw -= e.movementX * sensitivity;
    pitch -= e.movementY * sensitivity;

    const limit = Math.PI / 2 - 0.01;
    pitch = Math.max(-limit, Math.min(limit, pitch));
    }
  });


  const camera = {
    view,
    projection,
    position,
    update: function(dt,setMat = false) {
      // forward vector
      const forward = [
        Math.cos(pitch) * Math.sin(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.cos(yaw),
      ];

      const right = [
        Math.sin(yaw - Math.PI / 2),
        0,
        Math.cos(yaw - Math.PI / 2),
      ];

      const move = speed * dt;
      
      if(userControlled){

      if (keys["KeyW"]) vec3.addScaled(position, forward, move, position);
      if (keys["KeyS"]) vec3.addScaled(position, forward, -move, position);
      if (keys["KeyA"]) vec3.addScaled(position, right, -move, position);
      if (keys["KeyD"]) vec3.addScaled(position, right, move, position);
      }

      const target = vec3.add(position, forward)
      

      mat4.clone(view, viewPrev);

      mat4.lookAt(
        position,
        target,
        [0, 1, 0],
        view
      );

      if(setMat){

        mat4.clone(setMat,view);

      }
      //alert(view)

      return { view, projection: this.projection, viewPrev };
    }
  };
  
  return camera;
}

const canvas = document.getElementById("canvas")


if (!navigator.gpu)
    console.error("navigator.gpu not found")
if (!navigator.gpu.wgslLanguageFeatures.has("packed_4x8_integer_dot_product")) {
    throw new Error("Packed 4x8 integer functions are not supported by this GPU.");
}
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter)
    alert("adapter not found")
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
  });
  device.addEventListener('uncapturederror', (event) => {
    alert(event.error.message);
  });

   const module = device.createShaderModule({
    label: 'our hardcoded red triangle shaders',
    code: /* wgsl */ `

    struct Camera {

      view: mat4x4<f32>,
      proj: mat4x4<f32>,
      viewProj: mat4x4<f32>,

      viewInv: mat4x4<f32>,
      projInv: mat4x4<f32>,
      viewProjInv: mat4x4<f32>,

      position: vec3<f32>,
      length: f32
    
    
    };

    struct detail {
    
      voxel: vec4<i32>,
      tile: vec4<u32>
    }

    @group(0) @binding(0) var<storage, read_write> data: array<f32>;
    @group(0) @binding(1) var<uniform> level: u32;
    @group(0) @binding(2) var<uniform> screen_size: vec2<f32>;
    @group(0) @binding(3) var<storage, read_write> resolution0_modify: array<atomic<u32>>;
    @group(0) @binding(4) var<storage, read> resolution0_read: array<u32>;
    @group(0) @binding(5) var<uniform> camera: Camera;
    @group(0) @binding(6) var<storage> voxels: array<vec4<i32>>;
    @group(0) @binding(7) var<storage> offsets: array<u32>;
    @group(0) @binding(8) var<storage> dimensions: array<vec4<u32>>;
    @group(0) @binding(9) var<storage, read_write> arrayCounts: array<atomic<u32>>;
    @group(0) @binding(10) var<storage, read_write> detailBuffer: array<detail>;

    struct Ray {
    origin: vec3<f32>,
    invDir: vec3<f32>, // precomputed: 1.0 / ray.direction
};

    struct VertexShaderOutput {
    
     @builtin(position) position  : vec4f,
     @location(0) rayDirection : vec3f
    
    }

// Returns the distance t to the intersection, or a large value/negative if missed
fn intersectBox(boxMin: vec3<f32>, boxMax: vec3<f32>, ray: Ray, tMin: f32, tMax: f32) -> f32 {
    let tbot = (boxMin - ray.origin) * ray.invDir;
    let ttop = (boxMax - ray.origin) * ray.invDir;
    
    let tmin = min(ttop, tbot);
    let tmax = max(ttop, tbot);
    
    let t0 = max(max(tmin.x, tmin.y), tmin.z);
    let t1 = min(min(tmax.x, tmax.y), tmax.z);
    
    // Check if the intersection is within the valid [tMin, tMax] interval
    if (t1 >= max(t0, tMin) && t0 <= tMax) {
        return max(t0, tMin);
    }
    return -1.0; // No hit
}

fn unproject(
    ndc: vec3<f32>,
    invViewProj: mat4x4<f32>
) -> vec3<f32> {
    let h = invViewProj * vec4<f32>(ndc, 1.0);
    return h.xyz / h.w;
}

 struct AABB2 {
    minimum: vec2<f32>,
    maximum: vec2<f32>,
};

fn cubeScreenAABB(center: vec3<f32>) -> AABB2 {
    let h = 0.5;
    let M = camera.viewProj;

    // Transform the cube's center as a position.
    let C = M * vec4<f32>(center, 1.0);

    // Transform the 3 half-axes as directions.
    let X = M * vec4<f32>(h, 0.0, 0.0, 0.0);
    let Y = M * vec4<f32>(0.0, h, 0.0, 0.0);
    let Z = M * vec4<f32>(0.0, 0.0, h, 0.0);

    var lo = vec2<f32>(1e30);
    var hi = vec2<f32>(-1e30);

    for (var i = 0u; i < 8u; i++) {
        let sx = select(-1.0, 1.0, (i & 1u) != 0u);
        let sy = select(-1.0, 1.0, (i & 2u) != 0u);
        let sz = select(-1.0, 1.0, (i & 4u) != 0u);

        // Reconstruct a corner in clip space.
        let clip = C + sx * X + sy * Y + sz * Z;

        // Perspective divide.
        let ndc = clip.xy / clip.w;

        lo = min(lo, ndc);
        hi = max(hi, ndc);
    }

    return AABB2(lo, hi);
}



      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> VertexShaderOutput {
        let pos = array(
          vec2f( -1.0,  3.0),  // top center
          vec2f(-1.0, -1.0),  // bottom left
          vec2f( 3.0, -1.0)   // bottom right
        );

        let vertice = pos[vertexIndex];


        let direction = (
        unproject( 
        vec3<f32>(vertice, 1.0), 
        camera.viewProjInv) - camera.position) / 511.0;
 
        return VertexShaderOutput(vec4f(vertice, 0.0, 1.0), direction);
      }
 
      @fragment fn fs(fragmentInput : VertexShaderOutput) -> @location(0) vec4f {

       

        var depth = 0u;


        for(var i = 0u; i< arrayLength(&offsets); i++){

        let offset = offsets[i];
        let dimensions = dimensions[i];
        
        let n_uv = fragmentInput.position.xy / screen_size;
        let coord = vec2u(n_uv * vec2f(dimensions.xy));
        let uv = n_uv * 2.0 - 1.0;
        let sceneCamera = camera;
        let index = coord.x + coord.y * u32(dimensions.x) + offset;
        let levelDepth = resolution0_read[index];

        depth = max(levelDepth, depth);

   }

   

        //let rgb = vec3((f32(depth)/512) ,0.0,0.0);
        let ray = Ray(camera.position, 1.0/fragmentInput.rayDirection);

        let intersection = intersectBox(vec3(0.0,0.0,0.0),vec3(0.0,0.0,0.0) + vec3(1.0), ray, -10000.0, 10000.0);

        
       var boundingBox = cubeScreenAABB(vec3(0.5));

           boundingBox.minimum.x = (boundingBox.minimum.x + 1.0) * 0.5;
           
           //* f32(dimensions[6].x);
          boundingBox.minimum.y = (1.0 - boundingBox.minimum.y) * 0.5;
          
          //* f32(dimensions[6].y);
            
            boundingBox.maximum.x = (boundingBox.maximum.x + 1.0) * 0.5;
            
            //* f32(dimensions[6].x);
            boundingBox.maximum.y = (1.0 - boundingBox.maximum.y) * 0.5;
            
            //* f32(dimensions[6].y);


            let temp = boundingBox.maximum.y;
            boundingBox.maximum.y = boundingBox.minimum.y;
            boundingBox.minimum.y = temp;

            let p = 
            (fragmentInput.position.xy / screen_size);
            
            //* vec2f(dimensions[6].xy));


            if(p.x >= boundingBox.minimum.x && p.x <= boundingBox.maximum.x && p.y >= boundingBox.minimum.y && p.y <= boundingBox.maximum.y){
            
              //return vec4(0.0,intersection,1.0,1.0);
            
            }

        return vec4(1.0 - f32(depth)/512.0,intersection,0.0,1.00);

        //return vec4f(intersection/32.0,1.0,1.0,1.0);
        //return vec4f(rgb.x,0.0,0.0,1.0);

      }


      

        const scales_list = array(
        4294967295u, 
        4294967294u, 
        4294967292u,
        4294967288u,
        4294967280u,
        4294967264u,
        4294967232u,
        4294967168u,
        4294967040u,
        4294966784u,
        4294966272u,
        4294965248u,
        4294963200u,
        4294959104u,
        4294950912u,
        4294934528u,
        4294901760u,
        4294836224u,
        4294705152u,
        4294443008u,
        4293918720u,
        4292870144u,
        4290772992u,
        4286578688u,
        4278190080u,
        4261412864u,
        4227858432u,
        4160749568u,
        4026531840u,
        3758096384u,
        3221225472u,
        2147483648u,
        0u);

       

 
      @compute @workgroup_size(256) fn computeSomething(
        @builtin(global_invocation_id) id: vec3u
      ) {
        let i = id.x;

        let scale_mask = scales_list[level];

        var offset = 1u;

        if(level > 0){
          offset = 2u << (level - 1u);
        }

        let i_out = ((i & scale_mask) << 1u) + (i & ~scale_mask) + offset;
        let i_in =  ((i >> level) << (level + 1u )) + offset - 1u;

        if(i_in >= 0u && i_out < arrayLength(&data)){
          data[i_out] += data[i_in];
          
        }

        
      }

      struct AABBIntersection {
    bounds: AABB2,
    hit: bool,
}

fn intersectAABB(a: AABB2, b: AABB2) -> AABBIntersection {
    let intersectionMin = max(a.minimum, b.minimum);
    let intersectionMax = min(a.maximum, b.maximum);

    let hit = all(intersectionMin <= intersectionMax);

    return AABBIntersection(
        AABB2(intersectionMin, intersectionMax),
        hit
    );
}


fn fineTileBounds(p: vec2u, courseRes: vec2u, fineRes: vec2u) -> AABB2{

let lo = vec2f((p * fineRes) / courseRes);
let hi = ceil(vec2f((p + 1u) * fineRes) / vec2f(courseRes));

let bound = AABB2(lo,hi);

return bound;

}

        @compute @workgroup_size(256) fn detailing0(
        @builtin(global_invocation_id) id: vec3u) {
        
          //return;
          
          if (id.x >= atomicLoad(&arrayCounts[1])){
          
            return;
          
          }

          if (id.x >= 1){
          
            //return;
          
          }

          let element = detailBuffer[id.x];

          var boundingBox = cubeScreenAABB(vec3f(element.voxel.xyz)+ 0.5);

           boundingBox.minimum.x = (boundingBox.minimum.x + 1.0) * 0.5 * f32(dimensions[4].x);
          boundingBox.minimum.y = (1.0 - boundingBox.minimum.y) * 0.5 * f32(dimensions[4].y);
            
            boundingBox.maximum.x = (boundingBox.maximum.x + 1.0) * 0.5 * f32(dimensions[4].x);
            boundingBox.maximum.y = (1.0 - boundingBox.maximum.y) * 0.5 * f32(dimensions[4].y);


            let temp = boundingBox.maximum.y;
            boundingBox.maximum.y = boundingBox.minimum.y;
            boundingBox.minimum.y = temp;

            boundingBox.minimum.x -=1;
            boundingBox.minimum.y -=1;

            let center = vec3f(element.voxel.xyz) + 0.5;
            var projectedLoc = camera.viewProj * vec4(center,1.0);
            projectedLoc.xy /= projectedLoc.w;

            let depth = u32(projectedLoc.w);
   
            
          

          let tileBounds = fineTileBounds(element.tile.xy, dimensions[5].xy, dimensions[4].xy);
          let oi = offsets[6];

          for (var ix = u32(tileBounds.minimum.x)-0; ix< u32(tileBounds.maximum.x) +0; ix++){
          
            for (var iy = u32(tileBounds.minimum.y)-0; iy< u32(tileBounds.maximum.y) +0; iy++){
          

            let intersection = 
            
            intersectAABB(boundingBox,
            
            AABB2(
            
            vec2f(f32(ix),f32(iy)),
            
            vec2f(f32(ix),f32(iy))
            ));

            let index = ix + iy * dimensions[4].x + offsets[4];


            //atomicStore(&resolution0_modify[index],256u);

            if(intersection.hit){
            
            
            
            atomicMax(&resolution0_modify[index],512u - depth);
            //atomicStore(&resolution0_modify[index],128u);

   }
          
          }
          
          }


          //let tileSize = 1.0 / vec2f(dimensions[7].xy);

          //let subtiles = array(vec2f(0,0),vec2f(0.5,0),vec2f(0.5,0.5),vec2f(0,0.5));


          //for(var i =0u; i<4u; i++){
          

          //let shift = 2.0 * subtiles[i] * tileSize - 0.5 * tileSize;
          //let center =(vec2f(element.tile) * tileSize) - 0.5 + shift;

          //let tileBound = AABB2(center - tileSize/2.0, center + tileSize/2.0);
          //let intersection = intersectAABB(bounds,tileBound);

          //if(i == 1u){

          
            //var index = element.tile.x * 2u + u32(subtiles[i].x * 2.0) +  (element.tile.y * 2u + u32(subtiles[i].y * 2.0)) * dimensions[6].x + offsets[6];

          //let t = atomicLoad(&resolution0_modify[index]);

          atomicStore(&resolution0_modify[0],128u);
          
          //}
          
          //}

          
          


        
        }
        


        @compute @workgroup_size(256) fn initalRasterize(
          @builtin(global_invocation_id) id: vec3u) {


            if(id.x >= atomicLoad(&arrayCounts[0])){
            
              return;

            }

           
            let pos = voxels[id.x].xyz;
            let dim = dimensions[0];
            let off = offsets[0];
            let sk = screen_size;

            let center = vec3f(pos) + 0.5;
            var projectedLoc = camera.viewProj * vec4(center,1.0);
            projectedLoc.xy /= projectedLoc.w;

            //let ndc_n = (projectedLoc.xy + 1.0)*vec2(0.5,-0.5);



           

            let cam = camera;

            let depth = projectedLoc.w;


            
            //(boundingBox.minimum + vec2(1.0,1.0)) * vec2(0.5,0.5) * vec2f(dimensions[0].xy);
            //boundingBox.maximum = (boundingBox.maximum + vec2(1.0,1.0)) * vec2(0.5,0.5) * vec2f(dimensions[0].xy);
            
            //let area = (boundingBox.max.x - boundingBox.min.x) * screen_size.x * (boundingBox.max.y - boundingBox.min.y) * screen_size.y;


            //var coords = vec2u(ndc_n.xy * vec2f(dimensions[2].xy));
            //var index = coords.x + coords.y * dimensions[2].x + offsets[2];


                        var boundingBox = cubeScreenAABB(center);

            let area = 
            
            
            max(
            
            abs(boundingBox.maximum.x - boundingBox.minimum.x) * f32(dimensions[0].y),
            
            abs(boundingBox.maximum.y - boundingBox.minimum.y) * f32(dimensions[0].x)
            
            );


            
            var areaToLevel = u32(floor(log2(area / 4.0) * 1.0));
            areaToLevel = 5u;

            if (areaToLevel >= 0u && areaToLevel < (arrayLength(&offsets))){

            //coords = vec2u(ndc_n.xy * vec2f(dimensions[areaToLevel].xy));
            //index = coords.x + coords.y * dimensions[areaToLevel].x + offsets[areaToLevel];
            

            //boundingBox.minimum = (boundingBox.minimum + 1.0) *vec2(0.5,-0.5) * vec2f(dimensions[areaToLevel].xy);
            boundingBox.minimum.x = (boundingBox.minimum.x + 1.0) * 0.5 * f32(dimensions[areaToLevel].x);
            boundingBox.minimum.y = (1.0 - boundingBox.minimum.y) * 0.5 * f32(dimensions[areaToLevel].y);
            
            //boundingBox.maximum = (boundingBox.maximum + 1.0) *vec2(0.5,-0.5) * vec2f(dimensions[areaToLevel].xy);
            boundingBox.maximum.x = (boundingBox.maximum.x + 1.0) * 0.5 * f32(dimensions[areaToLevel].x);
            boundingBox.maximum.y = (1.0 - boundingBox.maximum.y) * 0.5 * f32(dimensions[areaToLevel].y);
   
            

            if(projectedLoc.w>0.0 
            && boundingBox.minimum.x>=0f && boundingBox.maximum.x<f32(dimensions[areaToLevel].x)
            && boundingBox.maximum.y>=0f && boundingBox.minimum.y<f32(dimensions[areaToLevel].y)){



            for (var ix = u32(boundingBox.minimum.x); ix<u32(ceil(boundingBox.maximum.x)); ix+=1){
            for (var iy = u32(boundingBox.maximum.y); iy<u32(ceil(boundingBox.minimum.y)); iy+=1){

              let indexModif = u32(ix) + u32(iy) * dimensions[areaToLevel].x + offsets[areaToLevel];


              //let pixelAABB = AABB2(vec2f(f32(ix+1),f32(iy+1)),vec2f(f32(ix-1),f32(iy-1)));

              


              if(ix > u32(boundingBox.minimum.x) && ix < u32(ceil(boundingBox.maximum.x)) - 1 && iy > u32(boundingBox.maximum.y) && iy < u32(ceil(boundingBox.minimum.y)) - 1 ){

             atomicMax(&resolution0_modify[indexModif],512u - u32(depth));

   }else{
    
    let id = atomicAdd(&arrayCounts[1], 1u);
    detailBuffer[id] = detail(vec4(pos, 1i), vec4u(ix, iy, areaToLevel,0 ));
    
    }

   }


   }

            

   }

   }
          
            


          }

    `,
  });

    const cameraBufferData = new Float32Array(16 + 16 + 16 + 16 + 16 + 16 +4)
    const cameraBuffer = device.createBuffer({
    label: 'camera buffer',
    size: cameraBufferData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

    const renderUniformData = new Float32Array([0, 0, 0, 0]);
    const renderUniform = device.createBuffer({
    label: 'render buffer',
    size: renderUniformData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const renderFrameBufferData = new Uint32Array(2 * window.innerWidth * window.innerHeight
  )


let resolutions = []
let dimensions = []

let currentSize = Infinity
let scale = 1.0;
let offset = 0
let offsets = []

while(currentSize > 2){

  currentSize =  Math.ceil(window.innerWidth/scale) * Math.ceil(window.innerHeight/scale) 
  dimensions.push(Math.ceil(window.innerWidth/scale), Math.ceil(window.innerHeight/scale),0 ,0 )
  offsets.push(offset)
  offset+= currentSize
scale *=2.0
resolutions.push(currentSize)

}
//alert(offsets)
//683, 384

const offsetBufferData = new Uint32Array(offsets)
const dimensionsBufferData = new Uint32Array(dimensions)

const offsetBuffer = device.createBuffer({
    label: 'offset buffer',
    size: offsetBufferData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

  const dimensionsBuffer = device.createBuffer({
    label: 'dimension buffer',
    size: dimensionsBufferData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

const arraySizeBufferData = new Uint32Array(16);

  const arraySizesBuffer = device.createBuffer({

    label: 'arraySize buffer',
    size: arraySizeBufferData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,


  })


//2332870

  

    const renderFrameBuffer = device.createBuffer({
    label: 'render buffer',
    size: renderFrameBufferData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })

    const renderPipeline = device.createRenderPipeline({
    label: 'our hardcoded red triangle pipeline',
    layout: 'auto',
    vertex: {
      entryPoint: 'vs',
      module,
    },
    fragment: {
      entryPoint: 'fs',
      module,
      targets: [{ format: presentationFormat }],
    },
  });

    const renderPassDescriptor = {
    label: 'our basic canvas renderPass',
    colorAttachments: [
      {
        // view: <- to be filled out when we render
        clearValue: [0.3, 0.3, 0.3, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };  

  const renderBindGroup = device.createBindGroup({
    label: 'bindGroup for work buffer',
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 2, resource: renderUniform },
      { binding: 4, resource: renderFrameBuffer },
      { binding: 5, resource: cameraBuffer },
      { binding: 7, resource: offsetBuffer },
      { binding: 8, resource: dimensionsBuffer },

    ],
  });

for (let m = 0; m < offsetBufferData.length; m++){

  for (let x = 0; x< dimensionsBufferData[m* 4 ]; x++){

    for (let y = 0; y< dimensionsBufferData[m * 4 + 1]; y++){

      let i = x + y * dimensionsBufferData[m * 4 ] + offsetBufferData[m]

      renderFrameBufferData[i] = (x / dimensionsBufferData[m * 4]) * 512
      //renderFrameBufferData[i] = (x / window.innerWidth) * 65536.0
    
  }

  }

}

//alert(renderFrameBufferData[0])

  device.queue.writeBuffer(renderFrameBuffer,0, renderFrameBufferData);
  device.queue.writeBuffer(offsetBuffer,0, offsetBufferData);
  device.queue.writeBuffer(dimensionsBuffer,0, dimensionsBufferData);

  const input = new Float32Array([
   2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101]);

   let passes = Math.ceil(Math.log2(input.length))
   //alert(passes)
    const workBuffer = device.createBuffer({
    label: 'work buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

    device.queue.writeBuffer(workBuffer, 0, input);


    const resultBuffer = device.createBuffer({
    label: 'result buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  });

  const alignment = device.limits.minUniformBufferOffsetAlignment;
const stride = Math.ceil(4 / alignment) * alignment;

//alert(stride)
  const uniform = new Uint32Array(stride/4 * 32);

  for(let i = 0; i<32; i++){


  uniform[i * stride/4] = i

}

//alert(uniform[256*3/4])

  const uniformBuffer = device.createBuffer({
    label: 'uniform buffer',
    size: stride * 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });



device.queue.writeBuffer(uniformBuffer, 0, uniform);



  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: "storage",

        },
    },
      
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
            type: "uniform",
            hasDynamicOffset: true,
            minBindingSize: 4,
        },
    }],
});

   const computeBindGroup = device.createBindGroup({
    label: 'bindGroup for work buffer',
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: workBuffer  },
      { binding: 1, resource: 
        {
          buffer: uniformBuffer,

            size: 4,}
        
      },
    ],
  });
  // Copy our input data to that buffer

  const computePipelineLayout = device.createPipelineLayout({
  label: "Compute Pipeline Layout",
  bindGroupLayouts: [computeBindGroupLayout] // Index matches @group(0)
});

     const computePipeline = device.createComputePipeline({
    label: 'doubling compute pipeline',
    layout: computePipelineLayout,
    compute: {
      entryPoint: 'computeSomething',
      module,
    },
  });

  const voxelBufferData = new Int32Array(32*32*32 * 4)

  let it = 0
  for(let x = 0; x<64; x++){

    for(let y=0; y<64; y++){

      for(let z = 0; z<64; z++){

        if(x%2+y%2+z%2==0 || x+y+z==0){
          voxelBufferData[it * 4 + 0] = x
          voxelBufferData[it * 4 + 1] = y
          voxelBufferData[it * 4 + 2] = z
        it++
        }

      }

    }

  }

    arraySizeBufferData[0] = it;
    device.queue.writeBuffer(arraySizesBuffer ,0 ,arraySizeBufferData)

    alert(4 * 8 * window.innerWidth * window.innerHeight)

const detailBuffer = device.createBuffer({
    label: 'detail buffer',
    size: 4 * 8 * window.innerWidth * window.innerHeight,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  })

  const voxelBuffer = device.createBuffer({
    label: 'voxel buffer',
    size: voxelBufferData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  })

  device.queue.writeBuffer(voxelBuffer, 0, voxelBufferData)

    const renderComputePipeline = device.createComputePipeline({
    label: 'render Compute pipeline',
    layout: "auto",
    compute: {
      entryPoint: 'initalRasterize',
      module,
    },
  });

  const renderComputeBindgroup = device.createBindGroup({
    label: 'bindGroup for compute Render Pipeline',
    layout: renderComputePipeline.getBindGroupLayout(0),
    entries: [

      { binding: 3, resource: renderFrameBuffer  },
      { binding: 6, resource: voxelBuffer },
      { binding: 5, resource: cameraBuffer },
      { binding: 2, resource: renderUniform },
      { binding: 7, resource: offsetBuffer },
      { binding: 8, resource: dimensionsBuffer },
      { binding: 9, resource: arraySizesBuffer },
      { binding: 10, resource: detailBuffer}
      
    ],
  });

  const detailComputePipeline = device.createComputePipeline({
    label: 'detail Compute pipeline',
    layout: "auto",
    compute: {
      entryPoint: 'detailing0',
      module,
    },
  });

  const detailComputeBindgroup = device.createBindGroup({
    label: 'bindGroup for compute Render Pipeline',
    layout: detailComputePipeline.getBindGroupLayout(0),
    entries: [

      {binding: 10, resource: detailBuffer},
      {binding: 3, resource: renderFrameBuffer},
      { binding: 7, resource: offsetBuffer },
      { binding: 8, resource: dimensionsBuffer },
      { binding: 9, resource: arraySizesBuffer },
      { binding: 5, resource: cameraBuffer }
      
    ],
  });



  var t = 0

    async function render() {



      arraySizeBufferData[1]= 0
      //arraySizeBufferData[0]= 1
       device.queue.writeBuffer(arraySizesBuffer, 0, arraySizeBufferData);
      

      const { view, projection, viewPrev } = camera.update(0.03);


      const viewProj = mat4.mul(projection,view);
      const inverseViewProj = mat4.inverse(viewProj);
      const inverseView = mat4.inverse(view)
      const inverseProj = mat4.inverse(projection)

      const cameraPos = vec4.transformMat4(vec4.set(0,0,0,1), inverseView);


      cameraBufferData.set(view, 16 * 0)
      cameraBufferData.set(projection, 16 * 1)
      cameraBufferData.set(viewProj, 16 * 2)
      cameraBufferData.set(inverseView, 16 * 3)
      cameraBufferData.set(inverseProj, 16 * 4)
      cameraBufferData.set(inverseViewProj, 16 * 5)
      cameraBufferData.set(cameraPos, 16 * 6)

      //alert(inverseView)


      device.queue.writeBuffer(cameraBuffer, 0, cameraBufferData)

      renderUniformData[0]=window.innerWidth
      renderUniformData[1]=window.innerHeight


      device.queue.writeBuffer(renderUniform, 0, renderUniformData)

    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    renderPassDescriptor.colorAttachments[0].view =
        context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder({ label: 'our encoder' });

    encoder.clearBuffer(renderFrameBuffer, 0)
    encoder.clearBuffer(detailBuffer, 0)

  for (let i = 0; i < passes; i++) {
    // Each pass gets its own stable ID.

    const pass = encoder.beginComputePass();

    pass.setPipeline(computePipeline);
    pass.setBindGroup(0, computeBindGroup, [stride * i]);

    pass.dispatchWorkgroups(1);
    pass.end();
}

const computeRenderPass = encoder.beginComputePass();
computeRenderPass.setPipeline(renderComputePipeline);
computeRenderPass.setBindGroup(0, renderComputeBindgroup);

computeRenderPass.dispatchWorkgroups(256)
computeRenderPass.end()

const detailRenderPass = encoder.beginComputePass();
detailRenderPass.setPipeline(detailComputePipeline)
detailRenderPass.setBindGroup(0, detailComputeBindgroup)

detailRenderPass.dispatchWorkgroups(256)
detailRenderPass.end()

const renderPass = encoder.beginRenderPass(renderPassDescriptor);
renderPass.setPipeline(renderPipeline)
renderPass.setBindGroup(0, renderBindGroup)
renderPass.draw(3)
renderPass.end()

  //encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);
 
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);


  //await resultBuffer.mapAsync(GPUMapMode.READ);
  //const result = new Float32Array(resultBuffer.getMappedRange());
 
//alert(input);
//alert(result);
 
  resultBuffer.unmap();
     
  }

const camera = createFPSCamera(canvas, 1.0, 512, true)

function loop(){



  stats.begin()
  render()
  stats.end()
  requestAnimationFrame(loop)

}
  
loop()

  