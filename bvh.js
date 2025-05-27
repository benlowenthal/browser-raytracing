import { Vector3, add, sub, mul } from "./vector3.js";
import { vert, tri } from "./environment.js";

export var bvh = [];
export var triIdx = [];

var nodesUsed;

export function buildBVH() {
  console.time("BVH build");
  nodesUsed = 1;

  //generate tri indices + centroids + aabbs
  triIdx = new Array(tri.length);
  const centr = new Array(tri.length);
  const triMin = new Array(tri.length);
  const triMax = new Array(tri.length);
  for (var i = 0; i < tri.length; i++) {
    triIdx[i] = i;

    const v0 = vert[tri[i].v0];
    const v1 = vert[tri[i].v1];
    const v2 = vert[tri[i].v2];

    centr[i] = new Vector3((v0.x + v1.x + v2.x) / 3, (v0.y + v1.y + v2.y) / 3, (v0.z + v1.z + v2.z) / 3);

    //precompute triangle bounds
    const triAabbMin = [
      Math.min(v0.x, v1.x, v2.x),
      Math.min(v0.y, v1.y, v2.y),
      Math.min(v0.z, v1.z, v2.z)
    ];
    const triAabbMax = [
      Math.max(v0.x, v1.x, v2.x),
      Math.max(v0.y, v1.y, v2.y),
      Math.max(v0.z, v1.z, v2.z)
    ];

    triMin[i] = new Vector3(...triAabbMin);
    triMax[i] = new Vector3(...triAabbMax);
  }

  bvh = [];
  bvh[0] = { aabbMin: new Vector3(), aabbMax: new Vector3(), offset: 0, triCount: tri.length };
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
  if (node.triCount <= 4) return;

  // determine split with SAH bins
  const { axis, splitPos, cost } = getSplit(idx, centr, triMin, triMax);

  // check whether the heuristic improves by subdividing
  const diff = sub(node.aabbMax, node.aabbMin);
  const area = diff.x * diff.y + diff.y * diff.z + diff.z * diff.x;
  if (cost >= node.triCount * area) return;


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

  bvh[leftChildIdx] = { aabbMin: new Vector3(), aabbMax: new Vector3(), offset: node.offset, triCount: leftCount };
  bvh[rightChildIdx] = { aabbMin: new Vector3(), aabbMax: new Vector3(), offset: i, triCount: node.triCount - leftCount };

  node.offset = leftChildIdx;
  node.triCount = 0;

  updateBounds(leftChildIdx, triMin, triMax);
  updateBounds(rightChildIdx, triMin, triMax);

  subdivide(leftChildIdx, centr, triMin, triMax);
  subdivide(rightChildIdx, centr, triMin, triMax);
}


function getSplit(idx, centr, triMin, triMax) {
  const node = bvh[idx];
  const diff = sub(node.aabbMax, node.aabbMin);

  const SPLITS = 4;
  var bestAxis = -1;
  var bestPos = 0;
  var bestCost = 1e30;

  const bins = new Array(SPLITS);
  for (var ax = 0; ax < 3; ax++) {
    if (getAxis(diff, ax) == 0) continue;

    for (var i = 0; i < SPLITS; i++) bins[i] = { aabbMin: [1e30, 1e30, 1e30], aabbMax: [-1e30, -1e30, -1e30], count: 0 };
    const scale = SPLITS / getAxis(diff, ax);

    //generate bins and assign tris
    for (var i = 0; i < node.triCount; i++) {
      const triId = triIdx[node.offset + i];
      let binIdx = Math.floor((getAxis(centr[triId], ax) - getAxis(node.aabbMin, ax)) * scale); //pick bin for tri
      binIdx = Math.max(Math.min(binIdx, SPLITS - 1), 0); //clamp to array range

      const leafTriMin = triMin[triId];
      const leafTriMax = triMax[triId];

      bins[binIdx].count++;

      bins[binIdx].aabbMin[0] = Math.min(bins[binIdx].aabbMin[0], leafTriMin.x);
      bins[binIdx].aabbMin[1] = Math.min(bins[binIdx].aabbMin[1], leafTriMin.y);
      bins[binIdx].aabbMin[2] = Math.min(bins[binIdx].aabbMin[2], leafTriMin.z);

      bins[binIdx].aabbMax[0] = Math.max(bins[binIdx].aabbMax[0], leafTriMax.x);
      bins[binIdx].aabbMax[1] = Math.max(bins[binIdx].aabbMax[1], leafTriMax.y);
      bins[binIdx].aabbMax[2] = Math.max(bins[binIdx].aabbMax[2], leafTriMax.z);
    }

    //abort if all tris in one bin
    for (var b of bins) if (b.count == node.triCount) continue;

    //gather area + count for each split
    const leftArea = [],  rightArea = [];
    const leftCount = [], rightCount = [];
    var leftBoxMin = [1e30, 1e30, 1e30],  leftBoxMax = [-1e30, -1e30, -1e30];
    var rightBoxMin = [1e30, 1e30, 1e30], rightBoxMax = [-1e30, -1e30, -1e30];
    var leftSum = 0, rightSum = 0;
    for (var i = 0; i < SPLITS - 1; i++) {
      leftSum += bins[i].count;
      leftCount[i] = leftSum;

      leftBoxMin[0] = Math.min(leftBoxMin[0], bins[i].aabbMin[0]);
      leftBoxMin[1] = Math.min(leftBoxMin[1], bins[i].aabbMin[1]);
      leftBoxMin[2] = Math.min(leftBoxMin[2], bins[i].aabbMin[2]);

      leftBoxMax[0] = Math.max(leftBoxMax[0], bins[i].aabbMax[0]);
      leftBoxMax[1] = Math.max(leftBoxMax[1], bins[i].aabbMax[1]);
      leftBoxMax[2] = Math.max(leftBoxMax[2], bins[i].aabbMax[2]);

      const leftDiff = [leftBoxMax[0] - leftBoxMin[0], leftBoxMax[1] - leftBoxMin[1], leftBoxMax[2] - leftBoxMin[2]];
      leftArea[i] = leftDiff[0] * leftDiff[1] + leftDiff[1] * leftDiff[2] + leftDiff[2] * leftDiff[0];

      rightSum += bins[SPLITS - i - 1].count;
      rightCount[SPLITS - i - 2] = rightSum;

      rightBoxMin[0] = Math.min(rightBoxMin[0], bins[SPLITS - i - 1].aabbMin[0]);
      rightBoxMin[1] = Math.min(rightBoxMin[1], bins[SPLITS - i - 1].aabbMin[1]);
      rightBoxMin[2] = Math.min(rightBoxMin[2], bins[SPLITS - i - 1].aabbMin[2]);

      rightBoxMax[0] = Math.max(rightBoxMax[0], bins[SPLITS - i - 1].aabbMax[0]);
      rightBoxMax[1] = Math.max(rightBoxMax[1], bins[SPLITS - i - 1].aabbMax[1]);
      rightBoxMax[2] = Math.max(rightBoxMax[2], bins[SPLITS - i - 1].aabbMax[2]);

      const rightDiff = [rightBoxMax[0] - rightBoxMin[0], rightBoxMax[1] - rightBoxMin[1], rightBoxMax[2] - rightBoxMin[2]];
      rightArea[SPLITS - i - 2] = rightDiff[0] * rightDiff[1] + rightDiff[1] * rightDiff[2] + rightDiff[2] * rightDiff[0];
    }

    //choose best split
    for (var i = 0; i < SPLITS - 1; i++) {
      const cost = leftCount[i] * leftArea[i] + rightCount[i] * rightArea[i];
      if (cost < bestCost) {
        bestAxis = ax;
        bestPos = getAxis(node.aabbMin, ax) + (i + 1) / scale;
        bestCost = cost;
      }
    }
  }

  return { axis: bestAxis, splitPos: bestPos, cost: bestCost }
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