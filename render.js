import { Vector3, dist, mul } from "./vector3.js";
import { bvh, triIdx, buildBVH } from "./bvh.js";
import { vert, normal, uvs, tri, mat, tex, buildOBJ, readMTL, readTexture } from "./environment.js";

const canvas = document.getElementById("canvas");
const context = canvas.getContext("webgpu");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

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
const dims = new Uint32Array([canvas.width, canvas.height]);
const wBuffer = device.createBuffer({
  label: "Dimensions",
  size: dims.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(wBuffer, 0, dims);


//compute gpu texture
var frame = device.createBuffer({
  label: "Frame storage",
  size: canvas.width * canvas.height * 4 * 4,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});


var bvhBuffer;
var sceneBuffer;
var triBuffer;
function writeBufferData() {
  //BVH data buffers
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


  //scene data
  const vertData = new Float32Array(vert.length * 3);
  for (var n = 0; n < vert.length; n++)
    vertData.set([ vert[n].x, vert[n].y, vert[n].z ], n * 3);

  const normalData = new Float32Array(normal.length * 3);
  for (var n = 0; n < normal.length; n++)
    normalData.set([ normal[n].x, normal[n].y, normal[n].z ], n * 3);

  const uvData = new Float32Array(uvs);

  sceneBuffer = device.createBuffer({
    label: "Scene Storage",
    size: vertData.byteLength + normalData.byteLength + uvData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(sceneBuffer, 0, vertData);
  device.queue.writeBuffer(sceneBuffer, vertData.byteLength, normalData);
  device.queue.writeBuffer(sceneBuffer, vertData.byteLength + normalData.byteLength, uvData);


  //primitives data
  const triData = new Uint32Array(tri.length * 10);
  for (var n = 0; n < tri.length; n++) {
    triData.set([
      tri[triIdx[n]].v0 * 3,
      tri[triIdx[n]].v1 * 3,
      tri[triIdx[n]].v2 * 3,
      (tri[triIdx[n]].v0n + vert.length) * 3,
      (tri[triIdx[n]].v1n + vert.length) * 3,
      (tri[triIdx[n]].v2n + vert.length) * 3,
      (tri[triIdx[n]].v0t * 2) + (vert.length + normal.length) * 3,
      (tri[triIdx[n]].v1t * 2) + (vert.length + normal.length) * 3,
      (tri[triIdx[n]].v2t * 2) + (vert.length + normal.length) * 3,
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
function writeMaterialData() {
  //material data
  const matData = new Float32Array(64 * 8);
  const matDataU = new Uint32Array(matData.buffer);
  for (var n = 0; n < mat.length; n++) {
    matDataU.set([mat[n].texture], n * 8);
    matData.set([
      mat[n].rough, mat[n].gloss, mat[n].transparency, mat[n].rIdx, 0, 0, 0
    ], n * 8 + 1);
  }

  matBuffer = device.createBuffer({
    label: "Material Storage",
    size: matData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(matBuffer, 0, matData);
}
writeMaterialData();


var textures;
async function writeTextureData() {
  //texture data
  const SIZE = 2048;
  textures = device.createTexture({
    label: "Texture array",
    size: [SIZE, SIZE, Math.max(tex.length, 2)],
    format: "rgba8unorm",
    dimension: "2d",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
  });

  for (var n = 0; n < tex.length; n++) {
    const bm = await createImageBitmap(tex[n], { resizeHeight: SIZE, resizeWidth: SIZE, resizeQuality: "high" });
    device.queue.copyExternalImageToTexture({ source: bm }, { texture: textures, origin: [0, 0, n] }, [SIZE, SIZE, 1]);
  }
}
writeTextureData();


//sampler buffer
const sampler = device.createSampler();


//camera position, rotation and uniforms
const cameraBuffer = device.createBuffer({
  label: "Camera Buffer",
  size: 8 * 4,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});


//light position, color and intensity
const lightTime = document.getElementById("lightTime");
const lightColor = document.getElementById("lightColor");
const lightBuffer = device.createBuffer({
  label: "Light Buffer",
  size: 8 * 4,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
let theta = Math.PI * 0.5;
device.queue.writeBuffer(lightBuffer, 0, new Float32Array([
  Math.cos(theta),
  Math.sin(theta) * Math.sin(40),
  -Math.sin(theta) * Math.cos(40), 0.3,
  1, 1, 1, 0.02
]));
lightTime.value = "12:00";
lightColor.value = "#FFFFFF";


//shader module
const shaderModule = device.createShaderModule({
  label: "Shader module",
  code: await fetch("shader.txt").then(r => r.text())
});


//bind group + layout
function uniformLayout(bind) { return { binding: bind, visibility: GPUShaderStage.COMPUTE, buffer: {} }; }
function storageLayout(bind) { return { binding: bind, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }; }

const bindGroupLayout = device.createBindGroupLayout({
  label: "Bind group layout",
  entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, buffer: {} },
    { binding: 1, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, buffer: { type: "storage" } },
    uniformLayout(2),
    uniformLayout(3),
    storageLayout(10),
    storageLayout(11),
    storageLayout(12),
    uniformLayout(13),
    { binding: 20, visibility: GPUShaderStage.COMPUTE, texture: { viewDimension: "2d-array" } },
    { binding: 21, visibility: GPUShaderStage.COMPUTE, sampler: {} }
  ]
});

var bindGroup;
function rebindGroup() {
  function bindBuffer(bind, buf) { return { binding: bind, resource: { buffer: buf } } }
  bindGroup = device.createBindGroup({
    label: "Bind group",
    layout: bindGroupLayout,
    entries: [
      bindBuffer(0, wBuffer),
      bindBuffer(1, frame),
      bindBuffer(2, cameraBuffer),
      bindBuffer(3, lightBuffer),
      bindBuffer(10, bvhBuffer),
      bindBuffer(11, sceneBuffer),
      bindBuffer(12, triBuffer),
      bindBuffer(13, matBuffer),
      { binding: 20, resource: textures.createView() },
      { binding: 21, resource: sampler }
    ]
  });
}
rebindGroup();

//pipelines + layout
const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

const computePipeline = device.createComputePipeline({
  label: "Megakernel pipeline",
  layout: pipelineLayout,
  compute: {
    module: shaderModule,
    entryPoint: "computeMain"
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
  const pass = encoder.beginComputePass();
  pass.setPipeline(computePipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(canvas.width / 8), Math.ceil(canvas.height / 8));
  pass.end();


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


// CAMERA CONTROLS

var distance = 20;
var pos = new Vector3(0, 0, 0);
var rot = new Vector3(0, 0, 0);
var framesSinceChange = 0;


var thetaX = 0, thetaY = -100;
var dragStartX, dragStartY, dragging = false, shifting = false;
var camHeight = 0;
canvas.addEventListener("mousedown", event => {
  dragging = true;
  dragStartX = event.pageX;
  dragStartY = event.pageY;
  shifting = event.shiftKey;
});
canvas.addEventListener("mousemove", event => {
  if (dragging) {
    if (shifting)
      camHeight += (event.pageY - dragStartY) / 10;
    else {
      thetaX += event.pageX - dragStartX;
      thetaY += event.pageY - dragStartY;
    }
    dragStartX = event.pageX;
    dragStartY = event.pageY;
    framesSinceChange = 0;
  }
});
canvas.addEventListener("mouseup", () => {
  dragging = false;
});
canvas.addEventListener("wheel", event => {
  if (event.deltaY > 0) distance *= 1.1;
  else if (event.deltaY < 0) distance /= 1.1;
  distance = Math.max(distance, 0.1);
  framesSinceChange = 0;
});


// BUTTON EVENTS

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  //Update dimension uniforms
  const dims = new Uint32Array([canvas.width, canvas.height]);
  device.queue.writeBuffer(wBuffer, 0, dims);

  //Recreate frame buffer
  frame = device.createBuffer({
    label: "Frame storage",
    size: canvas.width * canvas.height * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  rebindGroup();

  framesSinceChange = 0;
});


const importButton = document.getElementById("importButton");

importButton.addEventListener("click", async () => {
  importButton.disabled = true;

  //analyse uploaded files
  for (const f of document.getElementById("input").files) if (f.name.endsWith(".png") || f.name.endsWith(".jpg") || f.name.endsWith(".jpeg")) {
    console.log(f);
    readTexture(f);
  }
  await writeTextureData();

  for (const f of document.getElementById("input").files) if (f.name.endsWith(".mtl")) {
    console.log(f);
    await readMTL(f);
  }
  writeMaterialData();
  createMaterialPanel();

  for (const f of document.getElementById("input").files) if (f.name.endsWith(".obj")) {
    console.log(f);
    await buildOBJ(f);
    buildBVH();
  }
  writeBufferData();

  //rebind buffers (size change)
  rebindGroup();

  framesSinceChange = 0;
  importButton.disabled = false;
});

lightTime.addEventListener("change", () => {
  let t = lightTime.value;
  let mins = parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3, 5));
  let theta = Math.PI * (1.5 - 2 * (mins / 1440));
  device.queue.writeBuffer(lightBuffer, 0, new Float32Array([
    Math.cos(theta),
    Math.sin(theta) * Math.sin(40),
    -Math.sin(theta) * Math.cos(40)
  ]));
  framesSinceChange = 0;
});

lightColor.addEventListener("change", () => {
  let c = lightColor.value;
  device.queue.writeBuffer(lightBuffer, 4 * 4, new Float32Array([
    parseInt(c.slice(1, 3), 16) / 255,
    parseInt(c.slice(3, 5), 16) / 255,
    parseInt(c.slice(5, 7), 16) / 255
  ]));
  framesSinceChange = 0;
});


// ASIDE GENERATION

function createMaterialPanel() {
  //Generate material panel
  var panelHTML = "<label>Scene:</label>";
  for (var n = 0; n < mat.length; n++) {
    panelHTML += `
      <span style="flex-direction: column; align-items: stretch">
      <span><label>${mat[n].name}</label></span>
      <span><label>Texture:</label><input type="number" min="0" max="${tex.length}" step="1" value="${mat[n].texture}" id="${n}t" onchange="onChange(${n}, '${n}t', 'texture')" /></span>
      <span><label>Rough:</label><input type="number" min="0" max="1" step="0.01" value="${mat[n].rough}" id="${n}r" onchange="onChange(${n}, '${n}r', 'rough')" /></span>
      <span><label>Gloss:</label><input type="number" min="0" max="1" step="0.01" value="${mat[n].gloss}" id="${n}g" onchange="onChange(${n}, '${n}g', 'gloss')" /></span>
      <span><label>Transparency:</label><input type="number" min="0" max="1" step="0.01" value="${mat[n].transparency}" id="${n}tr" onchange="onChange(${n}, '${n}tr', 'transparency')" /></span>
      <span><label>Refr Idx:</label><input type="number" min="0" max="5" step="0.01" value="${mat[n].rIdx}" id="${n}i" onchange="onChange(${n}, '${n}i', 'rIdx')" /></span>
      </span>
    `;
  }
  document.getElementById("matPanel").innerHTML = panelHTML;
}
createMaterialPanel();

function onChange(m, element, attr) {
  mat[m][attr] = document.getElementById(element).value;
  writeMaterialData();
  rebindGroup();
  framesSinceChange = 0;
};
window.onChange = onChange;



// RENDERING LOOP

const MAX_FPS = 60;
const MIN_FRAME_TIME = 1000 / MAX_FPS;
while (true) {
  var frameStart = Date.now();

  pos.x = distance * Math.sin((thetaY) / 100) * Math.sin((thetaX) / 100);
  pos.y = distance * Math.cos((thetaY) / 100);
  pos.z = distance * Math.sin((thetaY) / 100) * Math.cos((thetaX) / 100);

  rot = mul(new Vector3(-pos.x, -pos.y, -pos.z), 1 / dist(pos));
  pos.y += camHeight;

  device.queue.writeBuffer(cameraBuffer, 0 * 4, new Float32Array([pos.x, pos.y, pos.z]));
  device.queue.writeBuffer(cameraBuffer, 3 * 4, new Uint32Array([frameStart % 1e6]));
  device.queue.writeBuffer(cameraBuffer, 4 * 4, new Float32Array([rot.x, rot.y, rot.z]));
  device.queue.writeBuffer(cameraBuffer, 7 * 4, new Uint32Array([framesSinceChange]));
  device.queue.submit([draw()]);

  await device.queue.onSubmittedWorkDone();

  var frameTime = Date.now() - frameStart;
  var fpsText = Math.round(10000 / frameTime) / 10;

  if (frameTime < MIN_FRAME_TIME) {
    await new Promise(r => setTimeout(r, MIN_FRAME_TIME - frameTime));
    fpsText += `(${MAX_FPS})`
  }
  framesSinceChange++;

  fpsLabel.innerHTML = fpsText;
  posLabel.innerHTML = Math.round(100 * pos.x) / 100 + ", " + Math.round(100 * pos.y) / 100 + ", " + Math.round(100 * pos.z) / 100;
  rotLabel.innerHTML = Math.round(100 * rot.x) / 100 + ", " + Math.round(100 * rot.y) / 100 + ", " + Math.round(100 * rot.z) / 100;
}
