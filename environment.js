import { Vector3 } from "./vector3.js";

export const vert = [
  new Vector3(-20, 0, -20),
  new Vector3(-20, 0, 0),
  new Vector3(-20, 0, 20),
  new Vector3(0, 0, -20),
  new Vector3(0, 0, 0),
  new Vector3(0, 0, 20),
  new Vector3(20, 0, -20),
  new Vector3(20, 0, 0),
  new Vector3(20, 0, 20),
];

export const normal = [
  new Vector3(0, 1, 0)
];

export const uvs = [
  1,1
];

export const tri = [
  { v0: 0, v1: 1, v2: 3, v0n: 0, v1n: 0, v2n: 0, v0t: 0, v1t: 0, v2t: 0, mat: 0 },
  { v0: 1, v1: 4, v2: 3, v0n: 0, v1n: 0, v2n: 0, v0t: 0, v1t: 0, v2t: 0, mat: 0 },
  { v0: 1, v1: 2, v2: 4, v0n: 0, v1n: 0, v2n: 0, v0t: 0, v1t: 0, v2t: 0, mat: 0 },
  { v0: 2, v1: 5, v2: 4, v0n: 0, v1n: 0, v2n: 0, v0t: 0, v1t: 0, v2t: 0, mat: 0 },
  { v0: 3, v1: 4, v2: 6, v0n: 0, v1n: 0, v2n: 0, v0t: 0, v1t: 0, v2t: 0, mat: 0 },
  { v0: 4, v1: 7, v2: 6, v0n: 0, v1n: 0, v2n: 0, v0t: 0, v1t: 0, v2t: 0, mat: 0 },
  { v0: 4, v1: 5, v2: 7, v0n: 0, v1n: 0, v2n: 0, v0t: 0, v1t: 0, v2t: 0, mat: 0 },
  { v0: 5, v1: 8, v2: 7, v0n: 0, v1n: 0, v2n: 0, v0t: 0, v1t: 0, v2t: 0, mat: 0 }
];

export const mat = [
  { name: "default", texture: 0, rough: 0, gloss: 0, transparency: 0, rIdx: 1 }
];

export const tex = [await fetch("missing.jpg").then(r => r.blob())];


export async function buildOBJ(blob) {
  console.time("OBJ parsing");

  const triOff = tri.length;
  const vertOff = vert.length;
  const normOff = normal.length;
  const uvOff = uvs.length / 2;

  //material map for quick lookup
  const matMap = new Map();
  for (let j = 0; j < mat.length; j++) matMap.set(mat[j].name, j);
  let matIdx = 0;

  // STRANGE CUSTOM STREAM MAGIC

  const decoder = new TextDecoder("utf-8");
  const reader = blob.stream().getReader();
  let { done, value } = await reader.read();
  let buffer = "";

  while (!done) {
    //expand buffer with next read chunk
    buffer += decoder.decode(value, { stream: true });

    let lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); //last line left in buffer

    //fill arrays with data
    for (const line of lines) {
      var sp = line.trim().split(/\s+/);

      if (sp[0] == "usemtl") matIdx = matMap.get(sp[1]) ?? 0;

      else if (sp[0] == "v") vert.push(new Vector3(parseFloat(sp[1]), parseFloat(sp[2]), -parseFloat(sp[3])));
      else if (sp[0] == "vn") normal.push(new Vector3(parseFloat(sp[1]), parseFloat(sp[2]), parseFloat(sp[3])));
      else if (sp[0] == "vt") {
        uvs.push(parseFloat(sp[1]));
        uvs.push(parseFloat(sp[2]));
      }

      else if (sp[0] == "f") {
        var v0 = sp[1].split(/\//);
        var v1 = sp[2].split(/\//);
        var v2 = sp[3].split(/\//);
        tri.push({
          v0: parseInt(v0[0]) - 1 + vertOff,  v1: parseInt(v1[0]) - 1 + vertOff,  v2: parseInt(v2[0]) - 1 + vertOff,
          v0n: parseInt(v0[2]) - 1 + normOff, v1n: parseInt(v1[2]) - 1 + normOff, v2n: parseInt(v2[2]) - 1 + normOff,
          v0t: parseInt(v0[1]) - 1 + uvOff,   v1t: parseInt(v1[1]) - 1 + uvOff,   v2t: parseInt(v2[1]) - 1 + uvOff,
          mat: matIdx
        });

        //split quad into 2 tris
        if (sp.length > 4) {
          var v3 = sp[4].split(/\//);
          tri.push({
            v0: parseInt(v0[0]) - 1 + vertOff,  v1: parseInt(v2[0]) - 1 + vertOff,  v2: parseInt(v3[0]) - 1 + vertOff,
            v0n: parseInt(v0[2]) - 1 + normOff, v1n: parseInt(v2[2]) - 1 + normOff, v2n: parseInt(v3[2]) - 1 + normOff,
            v0t: parseInt(v0[1]) - 1 + uvOff,   v1t: parseInt(v2[1]) - 1 + uvOff,   v2t: parseInt(v3[1]) - 1 + uvOff,
            mat: matIdx
          });
        }
      }
    }

    //read next line
    ({ done, value } = await reader.read());
  }

  console.timeEnd("OBJ parsing");
  console.log(".obj build successful");
  
  return { offset: triOff, count: tri.length - triOff };
}


export async function readMTL(blob) {
  console.time("MTL parsing");

  const txt = await blob.text().then(r => r.split(/\r?\n/));
  var matIdx = 0;

  for (const line of txt) {
    var sp = line.trim().split(/\s+/);
    if (sp[0] == "newmtl") matIdx = mat.push({ name: sp[1].trim(), texture: 0, rough: 0, gloss: 0, transparency: 0, rIdx: 1 }) - 1;

    else if (sp[0] == "Pr") mat[matIdx].rough = parseFloat(sp[1]);
    else if (sp[0] == "Pg") mat[matIdx].gloss = parseFloat(sp[1]);
    else if (sp[0] == "Ni") mat[matIdx].rIdx = parseFloat(sp[1]);
    else if (sp[0] == "Tr") mat[matIdx].transparency = parseFloat(sp[1]);
    else if (sp[0] == "d") mat[matIdx].transparency = 1 - parseFloat(sp[1]);

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
  console.log(mat);
  console.timeEnd("MTL parsing");
  console.log(".mtl read successful");
}

export function readTexture(blob) {
  console.time("Texture parsing");

  tex.push(blob);

  console.timeEnd("Texture parsing");
  console.log("Texture read successful");
}
