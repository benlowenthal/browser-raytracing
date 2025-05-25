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
export var triIdx = [];

var nodesUsed;

export function buildBVH() {
  console.time("BVH build");
  nodesUsed = 1;

  //generate tri indices + centroids + aabbs
  triIdx = [];
  const centr = [];
  const triMin = [];
  const triMax = [];
  for (var i = 0; i < tri.length; i++) {
    triIdx.push(i);
    centr.push(mul(add(add(vert[tri[i].v0], vert[tri[i].v1]), vert[tri[i].v2]), 0.3333));

    //precompute triangle bounds
    const v0 = vert[tri[i].v0];
    const v1 = vert[tri[i].v1];
    const v2 = vert[tri[i].v2];

    const triAabbMin = new Vector3(1e30, 1e30, 1e30);
    const triAabbMax = new Vector3(-1e30, -1e30, -1e30);

    triAabbMin.x = Math.min(v0.x, v1.x, v2.x);
    triAabbMin.y = Math.min(v0.y, v1.y, v2.y);
    triAabbMin.z = Math.min(v0.z, v1.z, v2.z);

    triAabbMax.x = Math.max(v0.x, v1.x, v2.x);
    triAabbMax.y = Math.max(v0.y, v1.y, v2.y);
    triAabbMax.z = Math.max(v0.z, v1.z, v2.z);

    triMin.push(triAabbMin);
    triMax.push(triAabbMax);
  }

  bvh = [];
  bvh[0] = new BVHNode(new Vector3(), new Vector3(), 0, tri.length);
  updateBounds(0, triMin, triMax);
  subdivide(0, centr, triMin, triMax);

  console.timeEnd("BVH build");
  console.log("BVH built: " + bvh.length + " nodes");
}

function updateBounds(idx, triMin, triMax) {
  const node = bvh[idx];

  node.aabbMin.x = 1e30,  node.aabbMin.y = 1e30,  node.aabbMin.z = 1e30;
  node.aabbMax.x = -1e30, node.aabbMax.y = -1e30, node.aabbMax.z = -1e30;

  for (var i = node.offset; i < node.offset + node.triCount; i++) {
    const leafTriMin = triMin[triIdx[i]];
    const leafTriMax = triMax[triIdx[i]];

    node.aabbMin.x = Math.min(node.aabbMin.x, leafTriMin.x);
    node.aabbMin.y = Math.min(node.aabbMin.y, leafTriMin.y);
    node.aabbMin.z = Math.min(node.aabbMin.z, leafTriMin.z);

    node.aabbMax.x = Math.max(node.aabbMax.x, leafTriMax.x);
    node.aabbMax.y = Math.max(node.aabbMax.y, leafTriMax.y);
    node.aabbMax.z = Math.max(node.aabbMax.z, leafTriMax.z);
  }
}

function subdivide(idx, centr, triMin, triMax) {
  const node = bvh[idx];
  if (node.triCount <= 2) return;

  // determine split with SAH bins
  const SPLITS = 4;
  var bestAxis = -1;
  var bestPos = 0;
  var bestCost = 1e30;
  for (var i = 1; i < SPLITS; i++) {
    const interval = add(node.aabbMin, mul(sub(node.aabbMax, node.aabbMin), i / SPLITS));
    for (var ax = 0; ax < 3; ax++) {
      const pos = getAxis(interval, ax);
      const cost = heuristic(idx, ax, pos, centr, triMin, triMax);
      if (cost < bestCost) {
        bestPos = pos;
        bestAxis = ax;
        bestCost = cost;
      }
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

  bvh[leftChildIdx] = new BVHNode(new Vector3(), new Vector3(), node.offset, leftCount);
  bvh[rightChildIdx] = new BVHNode(new Vector3(), new Vector3(), i, node.triCount - leftCount);

  node.offset = leftChildIdx;
  node.triCount = 0;

  updateBounds(leftChildIdx, triMin, triMax);
  updateBounds(rightChildIdx, triMin, triMax);

  subdivide(leftChildIdx, centr, triMin, triMax);
  subdivide(rightChildIdx, centr, triMin, triMax);
}

function heuristic(idx, axis, pos, centr, triMin, triMax) {
  const node = bvh[idx];

  var leftMinX = 1e30,   leftMinY = 1e30,   leftMinZ = 1e30;
  var leftMaxX = -1e30,  leftMaxY = -1e30,  leftMaxZ = -1e30;
  var rightMinX = 1e30,  rightMinY = 1e30,  rightMinZ = 1e30;
  var rightMaxX = -1e30, rightMaxY = -1e30, rightMaxZ = -1e30;
  var leftCount = 0;
  var rightCount = 0;

  for (var i = 0; i < node.triCount; i++ )
  {
    const triId = triIdx[node.offset + i];
    const leafTriMin = triMin[triId];
    const leafTriMax = triMax[triId];

    if (getAxis(centr[triId], axis) < pos) {
      leftCount++;

      leftMinX = Math.min(leftMinX, leafTriMin.x);
      leftMinY = Math.min(leftMinY, leafTriMin.y);
      leftMinZ = Math.min(leftMinZ, leafTriMin.z);

      leftMaxX = Math.max(leftMaxX, leafTriMax.x);
      leftMaxY = Math.max(leftMaxY, leafTriMax.y);
      leftMaxZ = Math.max(leftMaxZ, leafTriMax.z);
    } else {
      rightCount++;

      rightMinX = Math.min(rightMinX, leafTriMin.x);
      rightMinY = Math.min(rightMinY, leafTriMin.y);
      rightMinZ = Math.min(rightMinZ, leafTriMin.z);

      rightMaxX = Math.max(rightMaxX, leafTriMax.x);
      rightMaxY = Math.max(rightMaxY, leafTriMax.y);
      rightMaxZ = Math.max(rightMaxZ, leafTriMax.z);
    }
  }

  if (leftCount == 0 || rightCount == 0) return 1e30;

  const leftDiffX = leftMaxX - leftMinX, leftDiffY = leftMaxY - leftMinY, leftDiffZ = leftMaxZ - leftMinZ;
  const leftArea = leftDiffX * leftDiffY + leftDiffY * leftDiffZ + leftDiffZ * leftDiffX;

  const rightDiffX = rightMaxX - rightMinX, rightDiffY = rightMaxY - rightMinY, rightDiffZ = rightMaxZ - rightMinZ;
  const rightArea = rightDiffX * rightDiffY + rightDiffY * rightDiffZ + rightDiffZ * rightDiffX;

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