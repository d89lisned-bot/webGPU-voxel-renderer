const canvas = document.getElementById("canvas")

const MSSAA = 1; // Set the desired MSAA sample count (1, 2, 4, or 8)
const SCALE_FACTOR = 1.0; // Adjust this value to scale the canvas resolution



async function initiateGPU(canvas){


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

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
});

device.addEventListener('uncapturederror', (event) => {
    alert(event.error.message);
});


async function fetchShaders() {
  const response = await fetch('./src/shaders.wgsl');
  if (!response.ok) {
    throw new Error(`Failed to fetch shaders: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

const shaders = await fetchShaders();


return {shaders, device, context, presentationFormat, canvas}

    }



export {initiateGPU}
