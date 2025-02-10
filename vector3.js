export class Vector3 {
  constructor(x, y, z) {
    this.x = x; this.y = y; this.z = z;
  }
}

export function add(vec3a, vec3b) {
  return new Vector3(vec3a.x + vec3b.x, vec3a.y + vec3b.y, vec3a.z + vec3b.z);
}

export function sub(vec3a, vec3b) {
  return new Vector3(vec3a.x - vec3b.x, vec3a.y - vec3b.y, vec3a.z - vec3b.z);
}

export function mul(vec3, n) {
  return new Vector3(vec3.x * n, vec3.y * n, vec3.z * n);
}

export function dot(vec3a, vec3b) {
  return vec3a.x * vec3b.x + vec3a.y * vec3b.y + vec3a.z * vec3b.z;
}

export function cross(vec3a, vec3b) {
  return new Vector3(vec3a.y * vec3b.z - vec3a.z * vec3b.y, vec3a.z * vec3b.x - vec3a.x * vec3b.z, vec3a.x * vec3b.y - vec3a.y * vec3b.x);
}

export function dist2(vec3) {
  return vec3.x * vec3.x + vec3.y * vec3.y + vec3.z * vec3.z;
}

export function dist(vec3) {
  return Math.sqrt(dist2(vec3));
}