import { Vector3, dist, mul } from "./vector3.js";
import { bvh, triIdx } from "./bvh.js";
import { tlas, buildTLAS, registerObj, getMatrix } from "./tlas.js";
import { vert, normal, uvs, tri, mat, tex, buildOBJ, readMTL, readTexture } from "./environment.js";

const canvas = document.getElementById("canvas");
const context = canvas.getContext("webgpu");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;


//WebGPU initialize
if (!navigator.gpu) throw new Error("WebGPU not supported on this browser.");

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("Couldn't find WebGPU adapter for this browser.");

const device = await adapter.requestDevice();
if (!device) throw new Error("Couldn't find WebGPU device for this browser.");

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device: device, format: canvasFormat });


buildTLAS();
registerObj(0, 8);


//Fullscreen tri vertices
const vertices = new Float32Array([
  -1, -1,
  3, -1,
  -1, 3
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


var tlasBuffer;
var bvhBuffer;
var sceneBuffer;
var triBuffer;
function writeBufferData() {
  //TLAS buffer
  const tlasData = new Float32Array(tlas.length * 24);
  const tlasDataU = new Uint32Array(tlasData.buffer);
  for (var n = 0; n < tlas.length; n++) {
    tlasData.set([tlas[n].aabbMin.x, tlas[n].aabbMin.y, tlas[n].aabbMin.z], n * 24);
    tlasDataU.set([tlas[n].offset], n * 24 + 3);
    tlasData.set([tlas[n].aabbMax.x, tlas[n].aabbMax.y, tlas[n].aabbMax.z], n * 24 + 4);
    tlasDataU.set([tlas[n].nodeCount], n * 24 + 7);
    tlasData.set(getMatrix(n), n * 24 + 8);
  }

  tlasBuffer = device.createBuffer({
    label: "TLAS Storage",
    size: tlasData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(tlasBuffer, 0, tlasData);


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


var matBuffer = device.createBuffer({
  label: "Material Storage",
  size: 2048,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
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


//settings buffer and defaults
const planetSettings = document.getElementById("planetSettings");
const cloudSettings = document.getElementById("cloudSettings");
const settingsBuffer = device.createBuffer({
  label: "Settings Buffer",
  size: 8 * 4,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const settingsArray = new Float32Array(planetSettings.childElementCount + cloudSettings.childElementCount - 2);
for (var n = 1; n < planetSettings.childElementCount; n++) {
  let input = planetSettings.children[n].children[1];
  let idx = n - 1;
  input.addEventListener("change", () => {
    framesSinceChange = 0;
    settingsArray[idx] = parseFloat(input.value);
    device.queue.writeBuffer(settingsBuffer, 0, settingsArray);
  });
  settingsArray[idx] = parseFloat(input.value);
}
for (var n = 1; n < cloudSettings.childElementCount; n++) {
  let input = cloudSettings.children[n].children[1];
  let idx = n + 2;
  input.addEventListener("change", () => {
    framesSinceChange = 0;
    settingsArray[idx] = parseFloat(input.value);
    device.queue.writeBuffer(settingsBuffer, 0, settingsArray);
  });
  settingsArray[idx] = parseFloat(input.value);
}
device.queue.writeBuffer(settingsBuffer, 0, settingsArray);


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
    uniformLayout(4),
    storageLayout(10),
    storageLayout(11),
    storageLayout(12),
    storageLayout(13),
    uniformLayout(14),
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
      bindBuffer(4, settingsBuffer),
      bindBuffer(10, tlasBuffer),
      bindBuffer(11, bvhBuffer),
      bindBuffer(12, sceneBuffer),
      bindBuffer(13, triBuffer),
      bindBuffer(14, matBuffer),
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
  renderPass.draw(3); //3 per fullscreen tri
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
    framesSinceChange = 0;
    if (shifting)
      camHeight += (event.pageY - dragStartY) / 10;
    else {
      thetaX += event.pageX - dragStartX;
      thetaY += event.pageY - dragStartY;
    }
    dragStartX = event.pageX;
    dragStartY = event.pageY;
  }
});
canvas.addEventListener("mouseup", () => {
  dragging = false;
});
canvas.addEventListener("wheel", event => {
  framesSinceChange = 0;
  if (event.deltaY > 0) distance *= 1.1;
  else if (event.deltaY < 0) distance /= 1.1;
  distance = Math.max(distance, 0.1);
});


// BUTTON EVENTS

window.addEventListener("resize", () => {
  framesSinceChange = 0;
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
});


const importButton = document.getElementById("importButton");

importButton.addEventListener("click", async () => {
  importButton.disabled = true;
  framesSinceChange = 0;

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
    let obj = await buildOBJ(f);
    let idx = registerObj(obj.offset, obj.count);
    tlas[idx].name = f.name;
  }
  writeBufferData();
  createObjectPanel();

  //rebind buffers (size change)
  rebindGroup();

  importButton.disabled = false;
});

lightTime.addEventListener("change", () => {
  framesSinceChange = 0;
  let t = lightTime.value;
  let mins = parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3, 5));
  let theta = Math.PI * (1.5 - 2 * (mins / 1440));
  device.queue.writeBuffer(lightBuffer, 0, new Float32Array([
    Math.cos(theta),
    Math.sin(theta) * Math.sin(40),
    -Math.sin(theta) * Math.cos(40)
  ]));
});

lightColor.addEventListener("change", () => {
  framesSinceChange = 0;
  let c = lightColor.value;
  device.queue.writeBuffer(lightBuffer, 4 * 4, new Float32Array([
    parseInt(c.slice(1, 3), 16) / 255,
    parseInt(c.slice(3, 5), 16) / 255,
    parseInt(c.slice(5, 7), 16) / 255
  ]));
});


// ASIDE GENERATION

function createObjectPanel() {
  //Generate material panel
  var panelHTML = "";
  for (var n = 0; n < tlas.length; n++) {
    panelHTML += `
      <span style="flex-direction: column; align-items: stretch">
      <label>${tlas[n].name}</label>
      <span>
        <label>Position:</label>
        <input type="number" step="0.01" value="${tlas[n].pos.x}" id="${n}ps_x" onchange="onObjChange(${n}, '${n}ps_x', 'pos.x')" />
        <input type="number" step="0.01" value="${tlas[n].pos.y}" id="${n}ps_y" onchange="onObjChange(${n}, '${n}ps_y', 'pos.y')" />
        <input type="number" step="0.01" value="${tlas[n].pos.z}" id="${n}ps_z" onchange="onObjChange(${n}, '${n}ps_z', 'pos.z')" />
      </span>
      <span>
        <label>Rotation:</label>
        <input type="number" step="0.01" value="${tlas[n].rot.x}" id="${n}rt_x" onchange="onObjChange(${n}, '${n}rt_x', 'rot.x')" />
        <input type="number" step="0.01" value="${tlas[n].rot.y}" id="${n}rt_y" onchange="onObjChange(${n}, '${n}rt_y', 'rot.y')" />
        <input type="number" step="0.01" value="${tlas[n].rot.z}" id="${n}rt_z" onchange="onObjChange(${n}, '${n}rt_z', 'rot.z')" />
      </span>
      <span><label>Scale:</label><input type="number" min="0" max="1" step="0.01" value="${tlas[n].scale}" id="${n}sc" onchange="onObjChange(${n}, '${n}sc', 'scale')" /></span>
      </span>
    `;
  }
  document.getElementById("scenePanel").innerHTML = panelHTML;
}
createObjectPanel();

function onObjChange(n, element, attr) {
  framesSinceChange = 0;
  let split = attr.split(".");
  if (split.length == 1) tlas[n][attr] = parseFloat(document.getElementById(element).value);
  else tlas[n][split[0]][split[1]] = parseFloat(document.getElementById(element).value);
  device.queue.writeBuffer(tlasBuffer, (n * 24 + 8) * 4, new Float32Array(getMatrix(n)));
}
window.onObjChange = onObjChange;

function createMaterialPanel() {
  //Generate material panel
  var panelHTML = "";
  for (var n = 0; n < mat.length; n++) {
    panelHTML += `
      <span style="flex-direction: column; align-items: stretch">
      <label>${mat[n].name}</label>
      <span><label>Texture:</label><input type="number" min="0" max="${tex.length}" step="1" value="${mat[n].texture}" id="${n}tx" onchange="onMatChange(${n}, '${n}tx', 'texture')" /></span>
      <span><label>Rough:</label><input type="number" min="0" max="1" step="0.01" value="${mat[n].rough}" id="${n}rg" onchange="onMatChange(${n}, '${n}rg', 'rough')" /></span>
      <span><label>Gloss:</label><input type="number" min="0" max="1" step="0.01" value="${mat[n].gloss}" id="${n}gl" onchange="onMatChange(${n}, '${n}gl', 'gloss')" /></span>
      <span><label>Transparency:</label><input type="number" min="0" max="1" step="0.01" value="${mat[n].transparency}" id="${n}tr" onchange="onMatChange(${n}, '${n}tr', 'transparency')" /></span>
      <span><label>Refr Idx:</label><input type="number" min="0" max="5" step="0.01" value="${mat[n].rIdx}" id="${n}id" onchange="onMatChange(${n}, '${n}id', 'rIdx')" /></span>
      </span>
    `;
  }
  document.getElementById("matPanel").innerHTML = panelHTML;
}
createMaterialPanel();

function onMatChange(n, element, attr) {
  framesSinceChange = 0;
  mat[n][attr] = document.getElementById(element).value;
  device.queue.writeBuffer(matBuffer, n * 8 * 4, new Uint32Array([mat[n].texture]));
  device.queue.writeBuffer(matBuffer, (n * 8 + 1) * 4, new Float32Array([mat[n].rough, mat[n].gloss, mat[n].transparency, mat[n].rIdx]));
};
window.onMatChange = onMatChange;


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
  posLabel.innerHTML = `${Math.round(100 * pos.x) / 100}, ${Math.round(100 * pos.y) / 100}, ${Math.round(100 * pos.z) / 100}`;
  rotLabel.innerHTML = `${Math.round(100 * rot.x) / 100}, ${Math.round(100 * rot.y) / 100}, ${Math.round(100 * rot.z) / 100}`;
}
