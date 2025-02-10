import { Vector3, add, sub, mul } from "./vector3.js";
import { vert, tri } from "./environment.js";

class BVHNode {
  constructor(mi, ma, off, count) {
    this.aabbMin = mi;
    this.aabbMax = ma;
    this.offset = off;
    this.triCount = count;
  }
}

const bvh = [];
const vec0 = new Vector3(0, 0, 0);
var nodesUsed = 1;

//generate tri indices + centroids
const triIdx = [];
const centr = [];
for (var i = 0; i < tri.length; i++) {
  triIdx.push(i);
  centr[i] = mul(add(add(vert[tri[i].v0], vert[tri[i].v1]), vert[tri[i].v2]), 0.3333);
}

function buildBVH()
{
  bvh[0] = new BVHNode(vec0, vec0, 0, tri.length);
  updateBounds(0);
  subdivide(0);
}

function updateBounds(idx) {
  const node = bvh[idx];

  node.aabbMin = new Vector3(1e30, 1e30, 1e30);
  node.aabbMax = new Vector3(-1e30, -1e30, -1e30);

  for (var i = node.offset; i < node.offset + node.triCount; i++) {
    const leafTri = tri[triIdx[i]];
    const v0 = vert[leafTri.v0];
    const v1 = vert[leafTri.v1];
    const v2 = vert[leafTri.v2];

    node.aabbMin.x = Math.min(node.aabbMin.x, v0.x, v1.x, v2.x);
    node.aabbMin.y = Math.min(node.aabbMin.y, v0.y, v1.y, v2.y);
    node.aabbMin.z = Math.min(node.aabbMin.z, v0.z, v1.z, v2.z);

    node.aabbMax.x = Math.max(node.aabbMax.x, v0.x, v1.x, v2.x);
    node.aabbMax.y = Math.max(node.aabbMax.y, v0.y, v1.y, v2.y);
    node.aabbMax.z = Math.max(node.aabbMax.z, v0.z, v1.z, v2.z);
  }
}

function subdivide(idx) {
  const node = bvh[idx];
  if (node.triCount <= 2) return;

  // determine split axis and position
  const diff = sub(node.aabbMax, node.aabbMin);
  var axis = 0;
  if (diff.z > diff.y && diff.z > diff.x) axis = 2;
  else if (diff.y > diff.x) axis = 1;

  var splitPos;
  if (axis == 0) splitPos = node.aabbMin.x + diff.x * 0.5;
  else if (axis == 1) splitPos = node.aabbMin.y + diff.y * 0.5;
  else splitPos = node.aabbMin.z + diff.z * 0.5;

  // in-place partition
  var i = node.offset;
  var j = i + node.triCount - 1;
  while (i <= j) {
    if (axis == 0) {
      if (centr[triIdx[i]].x < splitPos) i++;
      else swap(i, j--);
    } else if (axis == 1) {
      if (centr[triIdx[i]].y < splitPos) i++;
      else swap(i, j--);
    } else {
      if (centr[triIdx[i]].z < splitPos) i++;
      else swap(i, j--);
    }
  }

  // abort split if one of the sides is empty
  const leftCount = i - node.offset;
  if (leftCount == 0 || leftCount == node.triCount) return;

  const leftChildIdx = nodesUsed++;
  const rightChildIdx = nodesUsed++;

  bvh[leftChildIdx] = new BVHNode(vec0, vec0, node.offset, leftCount);
  bvh[rightChildIdx] = new BVHNode(vec0, vec0, i, node.triCount - leftCount);

  node.offset = leftChildIdx;
  node.triCount = 0;

  updateBounds(leftChildIdx);
  updateBounds(rightChildIdx);

  subdivide(leftChildIdx);
  subdivide(rightChildIdx);
}

function swap(idx0, idx1) {
  const temp = triIdx[idx0];
  triIdx[idx0] = triIdx[idx1];
  triIdx[idx1] = temp;
}

buildBVH();
console.log(bvh);
export { bvh, triIdx };
