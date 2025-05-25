import { Vector3 } from "./vector3.js";

class Tri {
  constructor(a,b,c,i,j,k,x,y,z,m) {
    this.v0 = a;
    this.v1 = b;
    this.v2 = c;
    this.v0n = i;
    this.v1n = j;
    this.v2n = k;
    this.v0t = x;
    this.v1t = y;
    this.v2t = z;
    this.mat = m;
  }
}

class Material {
  constructor(name, t, r, gl, tr, rIdx) {
    this.name = name;
    this.texture = t;
    this.rough = r;
    this.gloss = gl;
    this.transparency = tr;
    this.rIdx = rIdx;
  }
}


export const vert = new Array(
  new Vector3(-20, 0, -20),
  new Vector3(-20, 0, 0),
  new Vector3(-20, 0, 20),
  new Vector3(0, 0, -20),
  new Vector3(0, 0, 0),
  new Vector3(0, 0, 20),
  new Vector3(20, 0, -20),
  new Vector3(20, 0, 0),
  new Vector3(20, 0, 20),
);

export const normal = new Array(
  new Vector3(0, 1, 0)
);

export const uvs = new Array(
  0.01, 0.01
);

export const tri = new Array(
  new Tri(0, 1, 3, 0, 0, 0, 0, 0, 0, 0),
  new Tri(1, 4, 3, 0, 0, 0, 0, 0, 0, 0),
  new Tri(1, 2, 4, 0, 0, 0, 0, 0, 0, 0),
  new Tri(2, 5, 4, 0, 0, 0, 0, 0, 0, 0),
  new Tri(3, 4, 6, 0, 0, 0, 0, 0, 0, 0),
  new Tri(4, 7, 6, 0, 0, 0, 0, 0, 0, 0),
  new Tri(4, 5, 7, 0, 0, 0, 0, 0, 0, 0),
  new Tri(5, 8, 7, 0, 0, 0, 0, 0, 0, 0)
);

export const mat = [
  new Material("default", 0, 0, 0.7, 0, 1)
];

export const tex = [await fetch("missing.jpg").then(r => r.blob())];


export async function buildOBJ(blob) {
  console.time("OBJ parsing");

  const txt = await blob.text().then(r => r.split("\n"));

  const vertOff = vert.length;
  const normOff = normal.length;
  const uvOff = uvs.length / 2;

  //material map for quick lookup
  const matMap = new Map();
  for (let j = 0; j < mat.length; j++) matMap.set(mat[j].name, j);
  let matIdx = 0;


  //fill arrays with data
  for (const line of txt) {
    var sp = line.trim().split(/\s+/);

    if (sp[0] == "usemtl") matIdx = matMap.get(sp[1]) ?? 0;

    else if (sp[0] == "v") vert.push( new Vector3(parseFloat(sp[1]), parseFloat(sp[2]), -parseFloat(sp[3])) );
    else if (sp[0] == "vn") normal.push( new Vector3(parseFloat(sp[1]), parseFloat(sp[2]), parseFloat(sp[3])) );
    else if (sp[0] == "vt") {
      uvs.push( parseFloat(sp[1]) );
      uvs.push( parseFloat(sp[2]) );
    }

    else if (sp[0] == "f") {
      var v0 = sp[1].split("/");
      var v1 = sp[2].split("/");
      var v2 = sp[3].split("/");
      tri.push( new Tri(
        parseInt(v0[0]) - 1 + vertOff, parseInt(v1[0]) - 1 + vertOff, parseInt(v2[0]) - 1 + vertOff,
        parseInt(v0[2]) - 1 + normOff, parseInt(v1[2]) - 1 + normOff, parseInt(v2[2]) - 1 + normOff,
        parseInt(v0[1]) - 1 + uvOff, parseInt(v1[1]) - 1 + uvOff, parseInt(v2[1]) - 1 + uvOff,
        matIdx
      ) );

      //split quad into 2 tris
      if (sp.length > 4) {
        var v3 = sp[4].split("/");
        tri.push( new Tri(
          parseInt(v0[0]) - 1 + vertOff, parseInt(v2[0]) - 1 + vertOff, parseInt(v3[0]) - 1 + vertOff,
          parseInt(v0[2]) - 1 + normOff, parseInt(v2[2]) - 1 + normOff, parseInt(v3[2]) - 1 + normOff,
          parseInt(v0[1]) - 1 + uvOff, parseInt(v2[1]) - 1 + uvOff, parseInt(v3[1]) - 1 + uvOff,
          matIdx
        ) );
      }
    }
  }

  console.timeEnd("OBJ parsing");
  console.log(".obj build successful");
}


export async function readMTL(blob) {
  console.time("MTL parsing");

  const txt = await blob.text().then(r => r.split("\n"));
  var matIdx = 0;

  for (var i = 0; i < txt.length; i++) {
    var sp = txt[i].trim().split(/\s+/);
    if (sp[0] == "newmtl") matIdx = mat.push(new Material(sp[1].trim(), 0, 0, 0, 0, 1)) - 1;
    else if (sp[0] == "map_Kd") {
      var existing = false;

      //reused texture
      for (var j = 0; j < tex.length; j++) if (tex[j].name == sp[1].trim()) {
        mat[matIdx].texture = j;
        existing = true;
        break;
      }

      //new texture
      if (!existing) console.log("Missing texture " + sp[1].trim());
    }
  }

  console.timeEnd("MTL parsing");
  console.log(".mtl read successful");
}

export function readTexture(blob) {
  console.time("Texture parsing");

  tex.push(blob);

  console.timeEnd("Texture parsing");
  console.log("Texture read successful");
}
