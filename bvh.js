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

export var bvh = [];
const vec0 = new Vector3(0, 0, 0);
var nodesUsed;

//generate tri indices + centroids
export var triIdx = [];
const centr = [];

export function buildBVH() {
  nodesUsed = 1;

  triIdx = [];
  for (var i = 0; i < tri.length; i++) {
    triIdx.push(i);
    centr[i] = mul(add(add(vert[tri[i].v0], vert[tri[i].v1]), vert[tri[i].v2]), 0.3333);
  }

  bvh = [];
  bvh[0] = new BVHNode(vec0, vec0, 0, tri.length);
  updateBounds(0);
  subdivide(0);
  console.log("BVH built");
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

  // determine split with SAH
  var bestAxis = -1;
  var bestPos = 0;
  var bestCost = 1e30;
  for (var i = 0; i < node.triCount; i++) for (var ax = 0; ax < 3; ax++)
  {
    const pos = getAxis(centr[triIdx[node.offset + i]], ax);
    const cost = heuristic(idx, ax, pos);
    if (cost < bestCost) {
      bestPos = pos;
      bestAxis = ax;
      bestCost = cost;
    }
  }
  const axis = bestAxis;
  const splitPos = bestPos;

  // check whether the heuristic improves by subdividing
  const diff = sub(node.aabbMax, node.aabbMin);
  const area = diff.x * diff.y + diff.y * diff.z + diff.z * diff.x;
  const parentCost = node.triCount * area;
  if (bestCost >= parentCost) return;


  // in-place partition
  var i = node.offset;
  var j = i + node.triCount - 1;
  while (i <= j) {
    if (getAxis(centr[triIdx[i]], axis) < splitPos) i++;
    else swap(i, j--);
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

function heuristic(idx, axis, pos) {
  const node = bvh[idx];

  var leftBoxMin = new Vector3(1e30, 1e30, 1e30);
  var leftBoxMax = new Vector3(-1e30, -1e30, -1e30);
  var rightBoxMin = new Vector3(1e30, 1e30, 1e30);
  var rightBoxMax = new Vector3(-1e30, -1e30, -1e30);
  var leftCount = 0;
  var rightCount = 0;

  for (var i = 0; i < node.triCount; i++ )
  {
    const triId = triIdx[node.offset + i];
    const v0 = vert[tri[triId].v0];
    const v1 = vert[tri[triId].v1];
    const v2 = vert[tri[triId].v2];
    if (getAxis(centr[triId], axis) < pos) {
      leftCount++;

      leftBoxMin.x = Math.min(leftBoxMin.x, v0.x, v1.x, v2.x);
      leftBoxMin.y = Math.min(leftBoxMin.y, v0.y, v1.y, v2.y);
      leftBoxMin.z = Math.min(leftBoxMin.z, v0.z, v1.z, v2.z);

      leftBoxMax.x = Math.max(leftBoxMax.x, v0.x, v1.x, v2.x);
      leftBoxMax.y = Math.max(leftBoxMax.y, v0.y, v1.y, v2.y);
      leftBoxMax.z = Math.max(leftBoxMax.z, v0.z, v1.z, v2.z);
    } else {
      rightCount++;

      rightBoxMin.x = Math.min(rightBoxMin.x, v0.x, v1.x, v2.x);
      rightBoxMin.y = Math.min(rightBoxMin.y, v0.y, v1.y, v2.y);
      rightBoxMin.z = Math.min(rightBoxMin.z, v0.z, v1.z, v2.z);

      rightBoxMax.x = Math.max(rightBoxMax.x, v0.x, v1.x, v2.x);
      rightBoxMax.y = Math.max(rightBoxMax.y, v0.y, v1.y, v2.y);
      rightBoxMax.z = Math.max(rightBoxMax.z, v0.z, v1.z, v2.z);
    }
  }

  const leftDiff = sub(leftBoxMax, leftBoxMin);
  const leftArea = leftDiff.x * leftDiff.y + leftDiff.y * leftDiff.z + leftDiff.z * leftDiff.x;

  const rightDiff = sub(rightBoxMax, rightBoxMin);
  const rightArea = rightDiff.x * rightDiff.y + rightDiff.y * rightDiff.z + rightDiff.z * rightDiff.x;

  const cost = leftCount * leftArea + rightCount * rightArea;
  return cost > 0 ? cost : 1e30;
}

function swap(idx0, idx1) {
  const temp = triIdx[idx0];
  triIdx[idx0] = triIdx[idx1];
  triIdx[idx1] = temp;
}

function getAxis(vec, axis) {
  if (axis == 0) return vec.x;
  else if (axis == 1) return vec.y;
  else return vec.z;
}