import {vec3, mat3, vec4, mat4} from 'wgpu-matrix';
import Stats from 'stats.js'
import { lodChunk } from './mesh.js'
import { createFPSCamera } from './3DMath.js';
import { initiateGPU } from './gpuSetup.js';

const canvas = document.getElementById("canvas")
canvas.width = window.innerWidth
canvas.height = window.innerHeight
const camera = createFPSCamera(canvas, 1.0, 512, true, 20, 0.002);


const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom);



const MSSAA = 1; // Set the desired MSAA sample count (1, 2, 4, or 8)
const SCALE_FACTOR = 1.0; // Adjust this value to scale the canvas resolution
const initiatedGPU = await initiateGPU(canvas)
Object.assign(globalThis, initiatedGPU)

const module = device.createShaderModule({
  label: 'our hardcoded red triangle shaders',
  code: shaders,
});

const cameraBufferData = new Float32Array(16 + 16 + 16 + 16 + 16 + 16 + 4)
const cameraBuffer = device.createBuffer({
  label: 'camera buffer',
  size: cameraBufferData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
})


const depthTexture = device.createTexture({
  size: {
    width: canvas.width/SCALE_FACTOR,
    height: canvas.height/SCALE_FACTOR,
  },
  format: 'depth24plus', // or 'depth32float'
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
  sampleCount: MSSAA, // Set the desired MSAA sample count (1, 2, 4, or 8)
});
const defferredTexture = device.createTexture({
  label: 'Defferred Texture',
  size: {
    width: canvas.width/SCALE_FACTOR,
    height: canvas.height/SCALE_FACTOR,
  },
  format: presentationFormat, // or 'depth32float'
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
});

  const msaaTexture = device.createTexture({
    label: 'MSAA Texture',
    size: {
      width: canvas.width/SCALE_FACTOR,
      height: canvas.height/SCALE_FACTOR,
    },
    format: presentationFormat,
    sampleCount: 4,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });


const screenResolutionBuffer = device.createBuffer({
  label: 'screen resolution buffer',
  size: 8, // 2 floats (width and height)
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const screenResolutionData = new Float32Array([canvas.width, canvas.height]);
device.queue.writeBuffer(screenResolutionBuffer, 0, screenResolutionData);

const vertexData = new Float32Array([

    1.0,0.0, 0.0,  0.0, 0.0, 1.0, // Vertex 3 (Bottom-Right, Blue)
    0.0, 1.0, 0.0,  1.0, 0.0, 0.0, // Vertex 1 (Top, Red)
    0.0,0.0, 0.0,  0.0, 1.0, 0.0, // Vertex 2 (Bottom-Left, Green)

    0.0, 1.0, 0.0,  1.0, 0.0, 0.0, // Vertex 1 (Top, Red)
    1.0,0.0, 0.0,  0.0, 0.0, 1.0, // Vertex 3 (Bottom-Right, Blue)
    1.0, 1.0, 0.0,  0.0, 1.0, 0.0, // Vertex 2 (Bottom-Left, Green)
     
  ]);

const vertexBuffer = device.createBuffer({
  label: "Vertices Buffer",
  size: vertexData.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, 
});

// Write your JavaScript array data into the GPU buffer
device.queue.writeBuffer(vertexBuffer, 0, vertexData);

const instanceBuffer = device.createBuffer({
  label: "Instance Buffer",
  size: 32*32*32*4*6*4,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const numObjects = 100;
const uniformSize = 64; // e.g., a 4x4 float32 matrix (16 * 4 bytes)

// Query hardware alignment (usually 256 bytes)
const alignment = device.limits.minUniformBufferOffsetAlignment;
const alignedStride = Math.ceil(uniformSize / alignment) * alignment;

const uniformBuffer = device.createBuffer({
  size: alignedStride * numObjects,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const bindGroupLayout = device.createBindGroupLayout({
  label:"my layout",
  entries: [
    {
      binding: 4,
      visibility: GPUShaderStage.VERTEX,
      buffer: {
        type: 'uniform',
        hasDynamicOffset: true, // Enables dynamic offsets for this binding
      },
    },
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: {
        type: 'uniform'
      },
    },

    {
      visibility: GPUShaderStage.VERTEX,
      binding: 3,
      buffer: {
        type: 'uniform'
      }
    }

  ],
});

const pipelineLayout = device.createPipelineLayout({
  bindGroupLayouts: [bindGroupLayout],
});

const renderPipeline = device.createRenderPipeline({
  label: 'our hardcoded red triangle pipeline',
  layout: pipelineLayout,
  vertex: {
    module,
    entryPoint: 'vs',
    buffers: [{
        arrayStride: 24, // 6 floats * 4 bytes
        stepMode: 'vertex', // Move to next element per vertex
        attributes: [
          {
            shaderLocation: 0, // Maps to @location(0) in WGSL
            offset: 0,         // Starts at the beginning of the stride
            format: 'float32x3'
          },
          {
            shaderLocation: 1, // Maps to @location(1) in WGSL
            offset: 12,        // Starts after 3 floats (3 * 4 bytes = 12)
            format: 'float32x3'
          }
        ]
      },
    {
        arrayStride: 4, // 1 32 bit data value
        stepMode: 'instance', // Move to next element per instance
        attributes: [
          {
            shaderLocation: 2, // Maps to @location(2) in WGSL
            offset: 0,         // Starts at the beginning of the stride
            format: 'uint32'
          }
        ]
      }
    ],
  },
  multisample: {
    count: MSSAA, // Set the desired MSAA sample count (1, 2, 4, or 8)
  },
  fragment: {
    module,
    entryPoint: 'fs',
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  depthStencil: {
    format: 'depth24plus', // Must match the depth texture format
    depthWriteEnabled: true,
    depthCompare: 'less', // Closer fragments pass the test
  },
  primitive: {
    topology: 'triangle-list', // or 'triangle-strip'
    frontFace: 'ccw',          // 'ccw' (counter-clockwise) or 'cw' (clockwise)
    cullMode: 'back',          // Enables backface culling: 'back', 'front', or 'none'
  },
});

const chunkUniformsData = new Float32Array(4 * 4 + 4 * 4);
chunkUniformsData[4] = 1
chunkUniformsData[5] = 1
chunkUniformsData[6] = 1

const chunkUniforms = device.createBuffer({

  label:'uniforms',
  size: chunkUniformsData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,

})

device.queue.writeBuffer(chunkUniforms, 0, chunkUniformsData);

const renderBindGroup = device.createBindGroup({
  label: 'render bind group',
  layout: renderPipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: cameraBuffer,
      },
    },

    {
      binding: 3,
      resource: {
        buffer: chunkUniforms,
      },
    },
    {
      binding: 4,
      resource: {
        buffer: uniformBuffer,
        offset: 0, // Base offset (keep at 0; dynamic offsets add to this)
        size: uniformSize, // Size of a single uniform instance
      },
    }
  ]
});

const renderPassDescriptor = {
  colorAttachments: [
    {
      view: undefined, // Assigned later
      resolveTarget: undefined, // Assigned later if using MSAA
      clearValue: { r: 0.5, g: 0.5, b: 0.8, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
  depthStencilAttachment: {
    view: depthTexture.createView(),
    depthClearValue: 1.0, // 1.0 is the farthest depth in WebGPU
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  }
};

const fullScreenQuadRenderPipeline = device.createRenderPipeline({
  label: 'full screen quad pipeline',
  layout: 'auto',
  vertex: {
    module,
    entryPoint: 'vs_quad',
    buffers: [],
  },
  fragment: {
    module,
    entryPoint: 'fs_quad',
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
    frontFace: 'ccw',
    cullMode: 'none', // No culling for full-screen quad
  },
});

const fullScreenQuadBindGroup = device.createBindGroup({
  label: 'full screen quad bind group',
  layout: fullScreenQuadRenderPipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 1,
      resource: screenResolutionBuffer,
    },
    {
      binding: 2,
      resource: defferredTexture.createView(),
    },
  ]
});

const fullScreenQuadRenderPassDescriptor = {
  colorAttachments: [
    {
      view: undefined, // Assigned later
      clearValue: { r: 0.5, g: 0.5, b: 0.8, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
};

function render(){

  if (MSSAA > 1) {
    renderPassDescriptor.colorAttachments[0].view = msaaTexture.createView();
    renderPassDescriptor.colorAttachments[0].resolveTarget = defferredTexture.createView();
  } else {
    renderPassDescriptor.colorAttachments[0].view = defferredTexture.createView();
    renderPassDescriptor.colorAttachments[0].resolveTarget = undefined;
  }

  const data = new Float32Array((alignedStride / 4) * numObjects);
  let objPos = [{x:0,y:0,z:0},{x:32,y:0,z:0}]
for (let i = 0; i < objPos.length; i++) {
  const floatOffset = (i * alignedStride) / 4;
  data[floatOffset] = objPos[i].x
  data[floatOffset + 1] = objPos[i].y
  data[floatOffset + 2] = objPos[i].z
  // Write 16 floats for object i's transform matrix at data[floatOffset ... floatOffset + 15]
}
device.queue.writeBuffer(uniformBuffer, 0, data);

  const { view, projection } = camera.update(0.03);
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
  cameraBufferData.set([511],16 * 6 + 3)

  device.queue.writeBuffer(cameraBuffer, 0, cameraBufferData)

  chunkUniformsData[0] = 0;
  chunkUniformsData[1] = 0;
  chunkUniformsData[2] = 0;

  device.queue.writeBuffer(chunkUniforms,0, chunkUniformsData)


  let distance = Math.sqrt(
    Math.pow(cameraPos[0] - chunkUniformsData[0] - 16, 2) + 
    Math.pow(cameraPos[1] - chunkUniformsData[1] - 16, 2) + 
    Math.pow(cameraPos[2] - chunkUniformsData[2] - 16, 2)
  );

  let usedLOD = {
    x:Math.floor(Math.max(Math.log2(distance/64 + Math.abs(cameraPos[0] - chunkUniformsData[0] - 16)/16),0)),
    y:Math.floor(Math.max(Math.log2(distance/64 + Math.abs(cameraPos[1] - chunkUniformsData[1] - 16)/16),0)),
    z:Math.floor(Math.max(Math.log2(distance/64 + Math.abs(cameraPos[2] - chunkUniformsData[2] - 16)/16),0))
  }

  usedLOD.x = Math.min(usedLOD.x,lodChunk.LODCount.x-1)
  usedLOD.y = Math.min(usedLOD.y,lodChunk.LODCount.y-1)
  usedLOD.z = Math.min(usedLOD.z,lodChunk.LODCount.z-1)

  let fillRate = 1/( 2 * 2 * 2 )


  let instanceSet = lodChunk.getIndex({x:0,y:0,z:0}, usedLOD)
  
  if(!lodChunk.updateList[instanceSet.arrayElement]){
      
    lodChunk.updateLOD(usedLOD, fillRate)
    lodChunk.updateInstanceData(usedLOD)
    lodChunk.updateList[instanceSet.arrayElement] = true
    //alert("updated")
  }

  device.queue.writeBuffer(instanceBuffer,0, lodChunk.instanceArray[instanceSet.arrayElement]);

  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setBindGroup(0, renderBindGroup, new Uint32Array([0 * alignedStride]));
  passEncoder.setVertexBuffer(0, vertexBuffer);
  passEncoder.setVertexBuffer(1, instanceBuffer);
  passEncoder.setPipeline(renderPipeline);
  passEncoder.draw(6, lodChunk.quadCounts[instanceSet.arrayElement], 0, 0);


  passEncoder.end();

  fullScreenQuadRenderPassDescriptor.colorAttachments[0].view = textureView;
  const fullScreenQuadEncoder = commandEncoder.beginRenderPass(fullScreenQuadRenderPassDescriptor);
  fullScreenQuadEncoder.setPipeline(fullScreenQuadRenderPipeline);
  fullScreenQuadEncoder.setBindGroup(0, fullScreenQuadBindGroup);
  fullScreenQuadEncoder.draw(3, 1, 0, 0);
  fullScreenQuadEncoder.end();

  device.queue.submit([commandEncoder.finish()]);

}

function loop(){
    stats.begin();
    
    render();
    
    stats.end();
    requestAnimationFrame(loop);
}
loop();