# browser-raytracing
Hardware-accelerated .obj renderer in your browser.

- Runs using WebGPU on a Node.js server
- Loads vertex data/normals/uvs from .obj file
- Accurate reflection/refraction with TIR and Fresnel
- Progressive rendering
- Global illumination and environment color
- PBR-adjacent materials

Drag the mouse to move the view around your object.

Requires the Node.js server to run on HTTPS to avoid issues with CORS. With Chrome you can use the flag #unsafely-treat-insecure-origin-as-secure on localhost servers to bypass this temporarily.
