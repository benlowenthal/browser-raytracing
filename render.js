import { Vector3, dist, mul } from "./vector3.js";
import { bvh, triIdx, buildBVH } from "./bvh.js";
import { vert, normal, uvs, tri, mat, tex, buildOBJ } from "./environment.js";

const canvas = document.getElementById("canvas");
const context = canvas.getContext("webgpu");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

buildBVH();


//WebGPU initialize
if (!navigator.gpu) throw new Error("WebGPU not supported on this browser.");

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("Couldn't find WebGPU adapter for this browser.");

const device = await adapter.requestDevice();
if (!device) throw new Error("Couldn't find WebGPU device for this browser.");

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device: device, format: canvasFormat });


//Fullscreen tri vertices
const vertices = new Float32Array([
  //tri 1
  -1, -1,
  1, -1,
  1, 1,
  //tri 2
  -1, -1,
  1, 1,
  -1, 1,
]);

const vertexBufferLayout = {
  arrayStride: 8,
  attributes: [{
    format: "float32x2",
    offset: 0,
    shaderLocation: 0,
  }],
};
const vertexBuffer = device.createBuffer({
  label: "Fullscreen tri",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, 0, vertices);


//width/height uniforms
const dims = new Float32Array([canvas.width, canvas.height]);
const wBuffer = device.createBuffer({
  label: "Dimensions",
  size: dims.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(wBuffer, 0, dims);


//compute gpu texture
const frame = device.createTexture({
  label: "Compute texture",
  size: [canvas.width, canvas.height, 3],
  format: "r32float",
  dimension: "3d",
  usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
});


var bvhBuffer;
var vertBuffer;
var normalBuffer;
var uvBuffer;
var triBuffer;
function writeBufferData() {

  //BVH data buffer
  console.log(bvh);
  const bvhData = new Float32Array(bvh.length * 8);
  const bvhDataU = new Uint32Array(bvhData.buffer);
  for (var n = 0; n < bvh.length; n++) {
    bvhData.set([bvh[n].aabbMin.x, bvh[n].aabbMin.y, bvh[n].aabbMin.z], n * 8);
    bvhDataU.set([bvh[n].offset], n * 8 + 3);
    bvhData.set([bvh[n].aabbMax.x, bvh[n].aabbMax.y, bvh[n].aabbMax.z], n * 8 + 4);
    bvhDataU.set([bvh[n].triCount], n * 8 + 7);
  }

  bvhBuffer = device.createBuffer({
    label: "BVH Storage",
    size: bvhData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(bvhBuffer, 0, bvhData);


  //vertices data
  const vertData = new Float32Array(vert.length * 4);
  for (var n = 0; n < vert.length; n++) {
    vertData.set([
      vert[n].x, vert[n].y, vert[n].z, 0
    ], n * 4);
  }

  vertBuffer = device.createBuffer({
    label: "Vertex Storage",
    size: vertData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertBuffer, 0, vertData);


  //vertex normals data
  const normalData = new Float32Array(normal.length * 4);
  for (var n = 0; n < normal.length; n++) {
    normalData.set([
      normal[n].x, normal[n].y, normal[n].z, 0
    ], n * 4);
  }

  normalBuffer = device.createBuffer({
    label: "Vertex Normal Storage",
    size: normalData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(normalBuffer, 0, normalData);


  //vertex uv data
  const uvData = new Float32Array(uvs);

  uvBuffer = device.createBuffer({
    label: "Vertex UVs Storage",
    size: uvData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uvBuffer, 0, uvData);


  //primitives data
  const triData = new Uint32Array(tri.length * 10);
  for (var n = 0; n < tri.length; n++) {
    triData.set([
      tri[triIdx[n]].v0,
      tri[triIdx[n]].v1,
      tri[triIdx[n]].v2,
      tri[triIdx[n]].v0n,
      tri[triIdx[n]].v1n,
      tri[triIdx[n]].v2n,
      tri[triIdx[n]].v0t,
      tri[triIdx[n]].v1t,
      tri[triIdx[n]].v2t,
      tri[triIdx[n]].mat
    ], n * 10);
  }

  triBuffer = device.createBuffer({
    label: "Tri Storage",
    size: triData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(triBuffer, 0, triData);

}

writeBufferData();


var matBuffer;
var textures;
async function writeMaterialData() {

  //material data
  const matData = new Float32Array(mat.length * 5);
  const matDataU = new Uint32Array(matData);
  for (var n = 0; n < mat.length; n++) {
    matDataU[n * 5] = mat[n].texture;
    matData.set([
      mat[n].rough, mat[n].gloss, mat[n].transparency, mat[n].rIdx
    ], n * 5 + 1);
  }

  matBuffer = device.createBuffer({
    label: "Material Storage",
    size: matData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(matBuffer, 0, matData);


  //texture data
  const SIZE = 2048;
  textures = device.createTexture({
    label: "Texture array",
    size: [SIZE, SIZE, tex.length + 1],
    format: "rgba8unorm",
    dimension: "2d",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
  });

  for (var n = 0; n < tex.length; n++) {
    const bm = await fetch(tex[n]).then(r => r.blob()).then(r => createImageBitmap(r));
    device.queue.copyExternalImageToTexture({ source: bm }, { texture: textures, origin: [0, 0, n] }, [SIZE, SIZE]);
  }

}

writeMaterialData();


//sampler buffer
const sampler = device.createSampler();


//camera position & rotation
const posBuffer = device.createBuffer({
  label: "Position Buffer",
  size: 3 * 4,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const rotBuffer = device.createBuffer({
  label: "Rotation Buffer",
  size: 3 * 4,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});


//shader module
const shaderModule = device.createShaderModule({
  label: "Shader module",
  code: await fetch("shader.txt").then(r => r.text())
});


//bind group + layout
const bindGroupLayout = device.createBindGroupLayout({
  label: "Bind group layout",
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
    buffer: {}
  }, {
    binding: 1,
    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
    storageTexture: { format: "r32float", access: "read-write", viewDimension: "3d" }
  }, {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" }
  }, {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" }
  }, {
    binding: 4,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" }
  }, {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" }
  }, {
    binding: 6,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" }
  }, {
    binding: 7,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" }
  }, {
    binding: 8,
    visibility: GPUShaderStage.COMPUTE,
    texture: { viewDimension: "2d-array" }
  }, {
    binding: 9,
    visibility: GPUShaderStage.COMPUTE,
    sampler: {}
  }, {
    binding: 10,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {}
  }, {
    binding: 11,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {}
  }]
});

var bindGroup;
function rebindGroup() {

  bindGroup = device.createBindGroup({
    label: "Bind group",
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: { buffer: wBuffer }
    }, {
      binding: 1,
      resource: frame.createView()
    }, {
      binding: 2,
      resource: { buffer: bvhBuffer }
    }, {
      binding: 3,
      resource: { buffer: vertBuffer }
    }, {
      binding: 4,
      resource: { buffer: normalBuffer }
    }, {
      binding: 5,
      resource: { buffer: uvBuffer }
    }, {
      binding: 6,
      resource: { buffer: triBuffer }
    }, {
      binding: 7,
      resource: { buffer: matBuffer }
    }, {
      binding: 8,
      resource: textures.createView()
    }, {
      binding: 9,
      resource: sampler
    }, {
      binding: 10,
      resource: { buffer: posBuffer }
    }, {
      binding: 11,
      resource: { buffer: rotBuffer }
    }]
  });

}

rebindGroup();

//pipelines + layout
const pipelineLayout = device.createPipelineLayout({
  label: "Universal Pipeline Layout",
  bindGroupLayouts: [bindGroupLayout],
});

const computePipeline = device.createComputePipeline({
  label: "Compute pipeline",
  layout: pipelineLayout,
  compute: {
    module: shaderModule,
    entryPoint: "computeMain",
  }
});

const renderPipeline = device.createRenderPipeline({
  label: "Render pipeline",
  layout: pipelineLayout,
  vertex: {
    module: shaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: shaderModule,
    entryPoint: "fragmentMain",
    targets: [{ format: canvasFormat }]
  }
});

function draw() {
  const encoder = device.createCommandEncoder();

  //COMPUTE PASS
  const computePass = encoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(0, bindGroup);
  computePass.dispatchWorkgroups(Math.ceil(canvas.width / 8), Math.ceil(canvas.height / 8));
  computePass.end();


  //RENDER PASS
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      storeOp: "store",
    }]
  });
  renderPass.setPipeline(renderPipeline);
  renderPass.setVertexBuffer(0, vertexBuffer);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.draw(6); //3 per fullscreen tri
  renderPass.end();

  return encoder.finish();
}


const fpsLabel = document.getElementById("fps");
const posLabel = document.getElementById("pos");
const rotLabel = document.getElementById("rot");


var distance = 20;
var pos = new Vector3(0, 1, -distance);
var rot = new Vector3(0, 0, 1);

var theta = 0;
var delta = 0;
var dragging = false;
var dragStart;
canvas.addEventListener("mousedown", event => {
  dragging = true;
  dragStart = event.pageX;
});
canvas.addEventListener("mousemove", event => {
  if (dragging) delta = event.pageX - dragStart;
});
canvas.addEventListener("mouseup", () => {
  dragging = false;
  theta += delta;
  delta = 0;
});


document.getElementById("button").addEventListener("click", async () => {
  var inp = document.getElementById("input").files[0];
  if (inp != null) {
    //rewrite buffers after file reading finished
    await buildOBJ(inp).then(() => {
      buildBVH();
      writeBufferData();
      rebindGroup();
    });
  }
});


const MIN_FRAME_TIME = 1000 / 60; //60 fps max
while (true) {
  var frameStart = Date.now();

  pos.x = distance * Math.sin((theta + delta) / 100);
  pos.z = distance * Math.cos((theta + delta) / 100);
  rot = mul(new Vector3(-pos.x, -pos.y, -pos.z), 1 / dist(pos));

  device.queue.writeBuffer(posBuffer, 0, new Float32Array([pos.x, pos.y, pos.z]));
  device.queue.writeBuffer(rotBuffer, 0, new Float32Array([rot.x, rot.y, rot.z]));
  device.queue.submit([draw()]);

  await device.queue.onSubmittedWorkDone();

  var frameTime = Date.now() - frameStart;
  if (frameTime < MIN_FRAME_TIME) {
    await new Promise(r => setTimeout(r, MIN_FRAME_TIME - frameTime));
    frameTime = MIN_FRAME_TIME;
  }

  fpsLabel.innerHTML = Math.round(10000 / frameTime) / 10 + " fps";
  posLabel.innerHTML = "Camera position: " + Math.round(100 * pos.x) / 100 + ", " + Math.round(100 * pos.y) / 100 + ", " + Math.round(100 * pos.z) / 100;
  rotLabel.innerHTML = "Camera rotation: " + Math.round(100 * rot.x) / 100 + ", " + Math.round(100 * rot.y) / 100 + ", " + Math.round(100 * rot.z) / 100;
}
