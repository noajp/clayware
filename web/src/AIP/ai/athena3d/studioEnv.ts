import * as THREE from 'three';

/**
 * Procedural 3-point photography studio PMREM environment map tuned for
 * PBR .glb models (porcelain / ceramic / metallic gold / velvet).
 * Zero external HDRI network cost.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0d0f16);

  const addPanel = (
    color: number,
    intensity: number,
    pos: [number, number, number],
    scale: [number, number, number],
    lookAt: [number, number, number] = [0, 0, 0],
  ) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.lookAt(...lookAt);
    envScene.add(mesh);
  };

  // Large overhead warm-white softbox
  addPanel(0xfffdf8, 2.2, [0.2, 6.0, 2.2], [7, 6, 1]);
  // High front-left key softbox for gentle ceramic modeling + crisp eye catchlight
  addPanel(0xffffff, 2.4, [-4.0, 4.4, 3.8], [3.6, 3.6, 1]);
  // Right cool-pearl rim strip to carve silhouette cleanly against dark surfaces
  addPanel(0xdce8ff, 2.1, [5.0, 2.0, -1.6], [3.5, 6.5, 1]);
  // Warm champagne-gold bounce for metallic crown detail
  addPanel(0xffe7c2, 1.5, [-5.2, 0.5, -1.2], [3.5, 5.0, 1]);
  // Soft lower fill bounce
  addPanel(0xdce2f0, 0.9, [0, -5.0, 2.4], [8, 6, 1]);

  const rt = pmrem.fromScene(envScene, 0.035);

  envScene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
  });
  pmrem.dispose();

  return rt.texture;
}
