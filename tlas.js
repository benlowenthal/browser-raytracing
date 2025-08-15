import { Vector3, add, sub, mul } from "./vector3.js";
import { buildBVH } from "./bvh.js";

export var tlas = [];

export function buildTLAS() { }

export function registerObj(offset, count) {
  let out = buildBVH(offset, count);
  let idx = tlas.push({ name: "unnamed", aabbMin: out.aabbMin, aabbMax: out.aabbMax, offset: out.offset, nodeCount: out.nodeCount, pos: new Vector3(), rot: new Vector3(), scale: 1 });
  return idx - 1;
}

export function getMatrix(i) {
  let node = tlas[i];

  let sx = Math.sin(node.rot.x);
  let sy = Math.sin(node.rot.y);
  let sz = Math.sin(node.rot.z);
  let cx = Math.cos(node.rot.x);
  let cy = Math.cos(node.rot.y);
  let cz = Math.cos(node.rot.z);

  //construct column-major matrix
  let m00 = node.scale * (cy * cz + sy * sx * sz);
  let m10 = node.scale * (cx * sz);
  let m20 = node.scale * (cy * sx * sz - cz * sy);
  let m30 = 0;
  
  let m01 = node.scale * (cz * sx * sy - cy * sz);
  let m11 = node.scale * (cx * cz);
  let m21 = node.scale * (cy * cz * sx + sy * sz);
  let m31 = 0;

  let m02 = node.scale * (cx * sy);
  let m12 = node.scale * (-sx);
  let m22 = node.scale * (cy * cx);
  let m32 = 0;

  let m03 = node.pos.x;
  let m13 = node.pos.y;
  let m23 = node.pos.z;
  let m33 = 1;

  return [m00, m10, m20, m30, m01, m11, m21, m31, m02, m12, m22, m32, m03, m13, m23, m33];
}