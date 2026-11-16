@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> screen_size: vec2f;
@group(0) @binding(2) var myTexture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> chunkData: chunk;
@group(0) @binding(4) var<uniform> testUniform: vec4f;

struct chunk {

    position: vec4f,
    scale: vec4f

}

const SCALE_FACTOR = 256.0f;

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

struct VertexShaderOutput {

    @builtin(position) position  : vec4f,
    @location(0) color  : vec3f,

}

struct VertexShaderInput {

    @location(0) position: vec3f, // Maps to shaderLocation: 0
    @location(1) color: vec3f,    // Maps to shaderLocation: 1

}

struct instanceInput {

    @location(2) quadData: u32
}

const NORMALS = array<vec3i, 6>(
    vec3( 1, 0, 0), vec3(-1, 0, 0),
    vec3( 0, 1, 0), vec3( 0,-1, 0),
    vec3( 0, 0, 1), vec3( 0, 0,-1)
);

@vertex fn vs(@builtin(vertex_index) vertexIndex : u32,input : VertexShaderInput, instance: instanceInput) -> VertexShaderOutput {
    
    let x = f32(instance.quadData & 31);
    let y = f32((instance.quadData>>5) & 31);
    let z = f32((instance.quadData>>10) & 31);

    let normalID = (instance.quadData>>15) & 31;
    let flip = mix(-1.0,1.0, f32(normalID%2==0));
    let shift = f32(normalID%2==1);
    let normal = vec3f(NORMALS[normalID]);
    let width = f32((instance.quadData>>20) & 31) + 1.0f;
    let height = f32((instance.quadData>>25) & 31) + 1.0f;

    var vertexPos = vec3f(x,y,z) + max(vec3f(normal), vec3(0.0));

    if (normalID < 2u) {   
        vertexPos.yz += vec2(width * flip,height) * input.position.xy + vec2(shift,0.0);
    
    } else if (normalID < 4u) {
        vertexPos.xz += vec2(width,height * flip) * input.position.xy + vec2(0.0,shift);
        vertexPos.y-= flip;

    } else {                 
        vertexPos.xy += vec2(width * flip,height) * input.position.xy + vec2(shift, 0.0);
    
    }
        
    let vertice = camera.viewProj * vec4(vertexPos * chunkData.scale.xyz + chunkData.position.xyz + testUniform.xyz,1.0);
    
    return VertexShaderOutput(vertice, input.color);
    
    }

@fragment fn fs(fragmentInput : VertexShaderOutput) -> @location(0) vec4f {

   return vec4(fragmentInput.color,1.0);
}

@vertex fn vs_quad(@builtin(vertex_index) id : u32) -> VertexShaderOutput {
    
    let pos = array(
        vec2f( -1.0,  3.0),  // top center
        vec2f(-1.0, -1.0),  // bottom left
        vec2f( 3.0, -1.0)   // bottom right
    );

    return VertexShaderOutput(vec4(pos[id],0.0,1.0), vec3(0.0));
    }

@fragment fn fs_quad(fragmentInput : VertexShaderOutput) -> @location(0) vec4f {

    let sample = textureLoad(myTexture, vec2u(fragmentInput.position.xy / screen_size * vec2f(textureDimensions(myTexture))),0);
    return vec4(sample.xyz,1.0);
}


