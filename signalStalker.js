import * as THREE from "three";

/**
 * Signal Stalker
 * Purpose-built liminal-horror spider with an articulated, procedural rig.
 * The limbs are separate tapered meshes on a lightweight 8-leg IK rig, so
 * walking is deterministic and works without external animation files.
 */
export class SignalStalkerRig {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = "SignalStalker_RIG";
    this.root.userData.creature = "signal-stalker";

    this.body = new THREE.Group();
    this.body.name = "Carapace_Root";
    this.root.add(this.body);

    const surfaceTextures = this.createSurfaceTextures();
    this.chitinTexture = surfaceTextures.color;
    this.chitinBumpTexture = surfaceTextures.bump;
    this.chitinRoughnessTexture = surfaceTextures.roughness;
    const chitinSurface = {
      map: this.chitinTexture,
      bumpMap: this.chitinBumpTexture,
      roughnessMap: this.chitinRoughnessTexture,
      bumpScale: 0.012,
      roughness: 0.78,
      metalness: 0.0
    };
    // Spider cuticle has a gentle oily highlight, not a metallic/plastic shine.
    this.shell = new THREE.MeshPhysicalMaterial({
      ...chitinSurface, color: 0xb99a80, roughness: 0.69,
      clearcoat: 0.24, clearcoatRoughness: 0.38
    });
    this.armor = new THREE.MeshPhysicalMaterial({
      ...chitinSurface, color: 0x9a7964, roughness: 0.73,
      clearcoat: 0.15, clearcoatRoughness: 0.46
    });
    this.edge = new THREE.MeshStandardMaterial({
      ...chitinSurface, color: 0x513b30, roughness: 0.88, bumpScale: 0.009
    });
    this.underside = new THREE.MeshStandardMaterial({
      ...chitinSurface, color: 0x80665a, roughness: 0.92, bumpScale: 0.01
    });
    this.oldScar = new THREE.MeshStandardMaterial({
      color: 0x49302a, roughness: 0.96, metalness: 0.0
    });
    this.markings = new THREE.MeshStandardMaterial({
      color: 0x715744, roughness: 0.93, metalness: 0.0
    });
    this.teeth = new THREE.MeshStandardMaterial({
      color: 0x8d7868, roughness: 0.34, metalness: 0.0
    });
    this.eyeSocket = new THREE.MeshStandardMaterial({
      color: 0x120a0a, roughness: 0.72, metalness: 0.0
    });
    this.eyes = new THREE.MeshPhysicalMaterial({
      color: 0x3e080d, emissive: 0x110002, emissiveIntensity: 0.035,
      roughness: 0.075, metalness: 0.0, clearcoat: 1.0,
      clearcoatRoughness: 0.025
    });
    this.eyeGlint = new THREE.MeshStandardMaterial({
      color: 0x4b211f, roughness: 0.22, metalness: 0.0
    });
    this.mawBlack = new THREE.MeshStandardMaterial({
      color: 0x080505, roughness: 0.98, metalness: 0.0
    });
    this.hairMaterial = new THREE.MeshStandardMaterial({
      color: 0x38271f, roughness: 0.98, metalness: 0.0
    });
    this.eyeMeshes = [];

    this.sphereGeo = new THREE.SphereGeometry(1, 28, 18);
    this.smallSphereGeo = new THREE.SphereGeometry(1, 16, 12);
    this.jointGeo = new THREE.SphereGeometry(1, 12, 9);
    this.upperLegGeo = new THREE.CylinderGeometry(0.043, 0.068, 1, 10, 2);
    this.lowerLegGeo = new THREE.CylinderGeometry(0.027, 0.047, 1, 9, 2);
    this.spikeGeo = new THREE.ConeGeometry(0.035, 0.12, 7, 1);
    this.clawGeo = new THREE.ConeGeometry(0.026, 0.14, 7, 1);
    this.bodyHairGeo = new THREE.ConeGeometry(0.0035, 0.035, 3, 1);
    this.legHairGeo = new THREE.ConeGeometry(0.0035, 0.032, 3, 1);
    this.legs = [];
    this.jaws = [];
    this.phase = 0;

    this.buildBody();
    this.buildLegRig();

    // Large enough to loom over the player, but far short of the previous 4x.
    this.root.scale.setScalar(1.8);
    this.baseGroundY = -0.081;

    this.root.traverse(obj => {
      if (obj.isMesh) {
        const fineHair = obj.name === "Fine_Abdomen_Setae" || obj.name === "Fine_Leg_Setae";
        obj.castShadow = !fineHair;
        obj.receiveShadow = !fineHair;
      }
    });

    this.frozen = false;
    this.update(0, 0, "roam");
    this.setFrozen(true);
  }

  createSurfaceTextures() {
    if (typeof document === "undefined") {
      return { color: null, bump: null, roughness: null };
    }

    const size = 256;
    let seed = 0x51a6e;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const makeGrid = side => {
      const values = new Float32Array(side * side);
      for (let i = 0; i < values.length; i++) values[i] = random();
      return { side, values };
    };
    const noiseGrids = [makeGrid(8), makeGrid(24), makeGrid(64), makeGrid(128)];
    const smooth = value => value * value * (3 - 2 * value);
    const sampleNoise = (grid, x, y) => {
      // The lattice wraps at the texture boundary, so the maps tile without
      // an obvious UV seam even when repeated across curved shells and legs.
      const gx = ((x + 0.5) / size) * grid.side;
      const gy = ((y + 0.5) / size) * grid.side;
      const xFloor = Math.floor(gx);
      const yFloor = Math.floor(gy);
      const x0 = ((xFloor % grid.side) + grid.side) % grid.side;
      const y0 = ((yFloor % grid.side) + grid.side) % grid.side;
      const x1 = (x0 + 1) % grid.side;
      const y1 = (y0 + 1) % grid.side;
      const tx = smooth(gx - xFloor);
      const ty = smooth(gy - yFloor);
      const at = (ix, iy) => grid.values[iy * grid.side + ix];
      const top = THREE.MathUtils.lerp(at(x0, y0), at(x1, y0), tx);
      const bottom = THREE.MathUtils.lerp(at(x0, y1), at(x1, y1), tx);
      return THREE.MathUtils.lerp(top, bottom, ty) - 0.5;
    };
    const makeCanvas = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      return canvas;
    };
    const colorCanvas = makeCanvas();
    const colorContext = colorCanvas.getContext("2d");
    const colorImage = colorContext.createImageData(size, size);
    const bumpCanvas = makeCanvas();
    const bumpContext = bumpCanvas.getContext("2d");
    const bumpImage = bumpContext.createImageData(size, size);
    const roughnessCanvas = makeCanvas();
    const roughnessContext = roughnessCanvas.getContext("2d");
    const roughnessImage = roughnessContext.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const coarse = sampleNoise(noiseGrids[0], x, y);
        const mottling = sampleNoise(noiseGrids[1], x, y);
        const pores = sampleNoise(noiseGrids[2], x, y);
        const grain = sampleNoise(noiseGrids[3], x, y);
        const colorNoise = coarse * 60 + mottling * 48 + pores * 27 + grain * 20;
        const bumpNoise = coarse * 20 + mottling * 35 + pores * 62 + grain * 57;
        const roughNoise = coarse * 8 + mottling * 21 + pores * 36 + grain * 24;
        const i = (y * size + x) * 4;

        // Naturally variegated umber/chestnut cuticle with faint warm highlights.
        colorImage.data[i] = THREE.MathUtils.clamp(132 + colorNoise, 47, 190);
        colorImage.data[i + 1] = THREE.MathUtils.clamp(99 + colorNoise * 0.76, 31, 151);
        colorImage.data[i + 2] = THREE.MathUtils.clamp(78 + colorNoise * 0.62, 23, 126);
        colorImage.data[i + 3] = 255;

        const bumpValue = THREE.MathUtils.clamp(128 + bumpNoise, 0, 255);
        bumpImage.data[i] = bumpValue;
        bumpImage.data[i + 1] = bumpValue;
        bumpImage.data[i + 2] = bumpValue;
        bumpImage.data[i + 3] = 255;

        const roughValue = THREE.MathUtils.clamp(185 + roughNoise, 115, 242);
        roughnessImage.data[i] = roughValue;
        roughnessImage.data[i + 1] = roughValue;
        roughnessImage.data[i + 2] = roughValue;
        roughnessImage.data[i + 3] = 255;
      }
    }

    colorContext.putImageData(colorImage, 0, 0);
    bumpContext.putImageData(bumpImage, 0, 0);
    roughnessContext.putImageData(roughnessImage, 0, 0);

    // Tiny pigment spots and shallow pores. Copy marks crossing a border so
    // the texture stays seamless when the renderer tiles it on the model.
    for (let i = 0; i < 165; i++) {
      const x = random() * size;
      const y = random() * size;
      const radius = 0.35 + random() * 1.7;
      const stretch = 0.65 + random() * 1.5;
      const angle = random() * Math.PI;
      const pigment = random() > 0.25
        ? "rgba(36,22,18,0.22)"
        : "rgba(218,170,128,0.15)";
      const pore = random() > 0.28
        ? "rgba(26,26,26,0.22)"
        : "rgba(225,225,225,0.18)";
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          colorContext.fillStyle = pigment;
          colorContext.beginPath();
          colorContext.ellipse(
            x + ox, y + oy, radius * stretch, radius,
            angle, 0, Math.PI * 2
          );
          colorContext.fill();

          bumpContext.fillStyle = pore;
          bumpContext.beginPath();
          bumpContext.ellipse(
            x + ox, y + oy, radius * stretch, radius,
            angle, 0, Math.PI * 2
          );
          bumpContext.fill();
        }
      }
    }

    const color = new THREE.CanvasTexture(colorCanvas);
    color.colorSpace = THREE.SRGBColorSpace;
    color.wrapS = color.wrapT = THREE.RepeatWrapping;
    color.repeat.set(2, 2);
    color.anisotropy = 2;
    const bump = new THREE.CanvasTexture(bumpCanvas);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(2, 2);
    bump.anisotropy = 2;
    const roughness = new THREE.CanvasTexture(roughnessCanvas);
    roughness.wrapS = roughness.wrapT = THREE.RepeatWrapping;
    roughness.repeat.set(2, 2);
    roughness.anisotropy = 2;

    return { color, bump, roughness };
  }

  addMesh(parent, geometry, material, name, position, scale, rotation) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    if (position) mesh.position.copy(position);
    if (scale) mesh.scale.copy(scale);
    if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    parent.add(mesh);
    return mesh;
  }

  ellipsoid(parent, name, material, p, s, rotation = null) {
    return this.addMesh(
      parent, this.sphereGeo, material, name,
      new THREE.Vector3(...p), new THREE.Vector3(...s), rotation
    );
  }

  between(mesh, a, b) {
    const delta = b.clone().sub(a);
    const length = Math.max(0.001, delta.length());
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), delta.multiplyScalar(1 / length)
    );
    const baseHeight = mesh.geometry?.parameters?.height || 1;
    mesh.scale.set(1, length / baseHeight, 1);
  }

  addSpike(parent, name, material, base, tip, radius = 0.105) {
    const direction = new THREE.Vector3(...tip).sub(new THREE.Vector3(...base));
    const height = direction.length();
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 5, 1), material
    );
    mesh.name = name;
    mesh.position.copy(new THREE.Vector3(...base).add(new THREE.Vector3(...tip)).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), direction.normalize()
    );
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  buildBody() {
    this.ellipsoid(this.body, "Abdomen_Core", this.underside,
      [0, 0.485, -0.46], [0.57, 0.345, 0.73], { x: -0.10, y: 0, z: 0 });
    this.ellipsoid(this.body, "Abdomen_Carapace", this.shell,
      [0, 0.665, -0.47], [0.535, 0.17, 0.695], { x: -0.10, y: 0, z: 0 });

    // Subtle chevrons replace the old mechanical plates and glowing cracks.
    this.ellipsoid(this.body, "Median_Abdomen_Mark", this.markings,
      [0, 0.813, -0.50], [0.075, 0.009, 0.40], { x: -0.10, y: 0, z: 0 });
    for (let i = 0; i < 5; i++) {
      const z = -0.79 + i * 0.145;
      const y = 0.785 - Math.abs(z + 0.47) * 0.075;
      for (const side of [-1, 1]) {
        this.ellipsoid(this.body, "Abdomen_Chevron_" + i + "_" + side, this.markings,
          [side * (0.105 + i * 0.004), y, z],
          [0.014, 0.007, 0.105 - i * 0.006],
          { x: -0.10, y: 0, z: side * 0.48 });
      }
    }

    this.ellipsoid(this.body, "Thorax", this.edge,
      [0, 0.455, 0.135], [0.385, 0.245, 0.455]);
    this.ellipsoid(this.body, "Thorax_Carapace", this.armor,
      [0, 0.585, 0.13], [0.365, 0.115, 0.42]);
    this.ellipsoid(this.body, "Neck", this.underside,
      [0, 0.43, 0.445], [0.225, 0.155, 0.205]);
    this.ellipsoid(this.body, "Head_Carapace", this.shell,
      [0, 0.515, 0.60], [0.292, 0.19, 0.275]);
    this.ellipsoid(this.body, "Face_Mask", this.armor,
      [0, 0.43, 0.775], [0.245, 0.125, 0.145]);
    this.ellipsoid(this.body, "Lower_Mandible_Plate", this.underside,
      [0, 0.32, 0.755], [0.205, 0.085, 0.14]);

    this.ellipsoid(this.body, "Maw_Interior", this.mawBlack,
      [0, 0.355, 0.885], [0.155, 0.075, 0.04]);
    const mouthRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.135, 0.018, 7, 20), this.edge
    );
    mouthRim.name = "Maw_Rim";
    mouthRim.position.set(0, 0.355, 0.902);
    mouthRim.scale.set(1.2, 0.72, 0.55);
    this.body.add(mouthRim);

    const eyes = [
      [-0.215, 0.585, 0.790, 0.030],
      [-0.125, 0.615, 0.835, 0.032],
      [-0.045, 0.628, 0.846, 0.026],
      [ 0.045, 0.628, 0.846, 0.026],
      [ 0.125, 0.615, 0.835, 0.032],
      [ 0.215, 0.585, 0.790, 0.030],
      [-0.105, 0.525, 0.853, 0.022],
      [ 0.105, 0.525, 0.853, 0.022]
    ];
    for (let i = 0; i < eyes.length; i++) {
      const [x, y, z, r] = eyes[i];
      this.addMesh(this.body, this.smallSphereGeo, this.eyeSocket,
        "Eye_Socket_" + i, new THREE.Vector3(x, y, z),
        new THREE.Vector3(r * 1.6, r * 1.4, r * 0.8));
      const eye = this.addMesh(this.body, this.smallSphereGeo, this.eyes,
        "Eye_" + i, new THREE.Vector3(x, y, z + 0.012),
        new THREE.Vector3(r * 0.82, r * 0.83, r * 0.7));
      eye.userData.emissiveEye = true;
      this.eyeMeshes.push(eye);
      this.addMesh(this.body, this.smallSphereGeo, this.eyeGlint,
        "Eye_Reflection_" + i,
        new THREE.Vector3(x - r * 0.18, y + r * 0.22, z + 0.031),
        new THREE.Vector3(r * 0.18, r * 0.16, r * 0.08));
    }

    // Paired chelicerae and palps, scaled to arachnid anatomy rather than a
    // monster's oversized teeth and horns.
    for (const side of [-1, 1]) {
      const jaw = new THREE.Group();
      jaw.name = side < 0 ? "Left_Chelicera_Rig" : "Right_Chelicera_Rig";
      jaw.position.set(side * 0.118, 0.325, 0.815);
      this.body.add(jaw);
      const main = this.addMesh(jaw, this.clawGeo, this.edge,
        "Chelicera", new THREE.Vector3(side * 0.027, -0.065, 0.035),
        new THREE.Vector3(1.35, 1.14, 1.25),
        { x: -0.38, y: 0, z: side * -0.24 });
      const tooth = this.addMesh(jaw, this.clawGeo, this.teeth,
        "Fang", new THREE.Vector3(-side * 0.026, -0.105, 0.075),
        new THREE.Vector3(0.68, 0.85, 0.7),
        { x: -0.48, y: 0, z: side * 0.12 });
      this.jaws.push({ jaw, side, main, tooth });
    }

    for (const side of [-1, 1]) {
      const palpUpper = this.addMesh(this.body, this.lowerLegGeo, this.shell,
        "Pedipalp", new THREE.Vector3(side * 0.215, 0.345, 0.79),
        new THREE.Vector3(0.92, 0.36, 0.92),
        { x: -0.48, y: 0, z: side * -0.54 });
      const palpTip = this.addMesh(this.body, this.clawGeo, this.edge,
        "Pedipalp_Tip", new THREE.Vector3(side * 0.305, 0.275, 0.845),
        new THREE.Vector3(0.56, 0.62, 0.56),
        { x: -0.2, y: 0, z: side * 0.18 });
      palpUpper.castShadow = palpTip.castShadow = true;
    }

    const dorsalHair = [
      [[-0.22,0.70,-0.88],[-0.25,0.78,-0.98],0.018],
      [[ 0.22,0.70,-0.82],[ 0.27,0.77,-0.91],0.016],
      [[-0.26,0.70,-0.55],[-0.31,0.77,-0.61],0.014],
      [[ 0.26,0.70,-0.46],[ 0.31,0.77,-0.51],0.014],
      [[-0.19,0.66,-0.22],[-0.25,0.73,-0.17],0.013],
      [[ 0.19,0.66,-0.16],[ 0.25,0.73,-0.10],0.013]
    ];
    dorsalHair.forEach((item, i) =>
      this.addSpike(this.body, "Short_Cuticle_Bristle_" + i, this.hairMaterial,
        item[0], item[1], item[2])
    );

    this.ellipsoid(this.body, "Old_Cuticle_Mark_1", this.oldScar,
      [-0.19, 0.794, -0.55], [0.018, 0.006, 0.12], { x: -0.1, y: 0.08, z: -0.12 });
    this.ellipsoid(this.body, "Old_Cuticle_Mark_2", this.oldScar,
      [0.17, 0.781, -0.24], [0.014, 0.006, 0.085], { x: -0.1, y: -0.15, z: 0.06 });

    for (const side of [-1, 1]) {
      this.addSpike(this.body, "Spinneret_" + side, this.edge,
        [side * 0.095, 0.39, -1.06],
        [side * 0.11, 0.34, -1.22], 0.028);
    }

    this.buildAbdomenSetae();
  }

  buildAbdomenSetae() {
    const count = 112;
    const bristles = new THREE.InstancedMesh(this.bodyHairGeo, this.hairMaterial, count);
    const dummy = new THREE.Object3D();
    let seed = 0x3a91b;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < count; i++) {
      let x, z, radial;
      do {
        x = (random() * 2 - 1) * 0.54;
        z = -0.46 + (random() * 2 - 1) * 0.68;
        radial = (x / 0.57) ** 2 + ((z + 0.46) / 0.73) ** 2;
      } while (radial > 0.91);

      const y = 0.485 + 0.345 * Math.sqrt(Math.max(0.06, 1 - radial));
      dummy.position.set(x, y + 0.002, z);
      const normal = new THREE.Vector3(
        x / (0.57 * 0.57),
        Math.max(0.15, (y - 0.485) / (0.345 * 0.345)),
        (z + 0.46) / (0.73 * 0.73)
      ).normalize();
      dummy.quaternion.setFromUnitVectors(up, normal);
      dummy.scale.setScalar(0.45 + random() * 0.9);
      dummy.updateMatrix();
      bristles.setMatrixAt(i, dummy.matrix);
    }
    bristles.name = "Fine_Abdomen_Setae";
    bristles.instanceMatrix.needsUpdate = true;
    bristles.computeBoundingSphere();
    bristles.castShadow = false;
    bristles.receiveShadow = false;
    this.body.add(bristles);
  }

  buildLegRig() {
    const hipsZ = [0.34, 0.09, -0.20, -0.46];
    const reach = [1.00, 1.18, 1.25, 1.09];
    const forwardBias = [0.45, 0.20, -0.18, -0.42];

    for (let row = 0; row < 4; row++) {
      for (const side of [-1, 1]) {
        const hip = new THREE.Vector3(side * 0.265, 0.385, hipsZ[row]);
        const upper = this.addMesh(this.root, this.upperLegGeo, this.shell,
          "Leg_" + row + "_" + side + "_Femur", new THREE.Vector3(),
          new THREE.Vector3(1, 1, 1));
        const lower = this.addMesh(this.root, this.lowerLegGeo, this.edge,
          "Leg_" + row + "_" + side + "_Tibia", new THREE.Vector3(),
          new THREE.Vector3(1, 1, 1));
        const hipJoint = this.addMesh(this.root, this.jointGeo, this.armor,
          "Leg_Hip_Joint", hip.clone(),
          new THREE.Vector3(0.084, 0.078, 0.084));
        const knee = this.addMesh(this.root, this.jointGeo, this.edge,
          "Leg_Knee_Joint", new THREE.Vector3(),
          new THREE.Vector3(0.069, 0.069, 0.069));
        const kneePlate = this.addMesh(this.root, this.spikeGeo, this.armor,
          "Small_Knee_Bristle", new THREE.Vector3(),
          new THREE.Vector3(0.52, 0.72, 0.52));
        const tibialSpine = this.addMesh(this.root, this.clawGeo, this.shell,
          "Tibial_Bristle", new THREE.Vector3(),
          new THREE.Vector3(0.42, 0.72, 0.42));
        const foot = new THREE.Vector3(
          side * reach[row], 0.045, hipsZ[row] + forwardBias[row]
        );
        const claws = [];
        for (let claw = 0; claw < 2; claw++) {
          claws.push(this.addMesh(this.root, this.clawGeo, this.edge,
            "Tarsal_Hook", new THREE.Vector3(),
            new THREE.Vector3(0.7, 0.72, 0.7)));
        }

        this.addLegSetae(upper, 9, 1200 + row * 19 + (side + 1) * 7, 0.061);
        this.addLegSetae(lower, 8, 2400 + row * 23 + (side + 1) * 9, 0.041);
        this.legs.push({
          row, side, hip, footBase: foot, upper, lower,
          hipJoint, knee, kneePlate, tibialSpine, claws,
          phase: (row % 2 ? Math.PI : 0) + (side < 0 ? Math.PI : 0)
        });
      }
    }
  }

  addLegSetae(segment, count, initialSeed, radius) {
    const hairs = new THREE.InstancedMesh(this.legHairGeo, this.hairMaterial, count);
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    let seed = initialSeed >>> 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const r = radius * (0.76 + random() * 0.30);
      const axial = (random() - 0.5) * 0.78;
      const outward = new THREE.Vector3(
        Math.cos(angle), (random() - 0.5) * 0.5, Math.sin(angle)
      ).normalize();
      dummy.position.set(Math.cos(angle) * r, axial, Math.sin(angle) * r);
      dummy.quaternion.setFromUnitVectors(up, outward);
      dummy.scale.setScalar(0.42 + random() * 0.78);
      dummy.updateMatrix();
      hairs.setMatrixAt(i, dummy.matrix);
    }
    hairs.name = "Fine_Leg_Setae";
    hairs.instanceMatrix.needsUpdate = true;
    hairs.computeBoundingSphere();
    hairs.castShadow = false;
    hairs.receiveShadow = false;
    segment.add(hairs);
  }

  setFrozen(frozen) {
    this.frozen = Boolean(frozen);
  }

  distanceToHitbox(worldX, worldZ) {
    const entity = this.root.parent;
    const yaw = entity?.rotation?.y || 0;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const scale = Math.max(0.001, Math.abs(this.root.scale.x || 1));
    const dx = worldX - (entity?.position?.x || 0);
    const dz = worldZ - (entity?.position?.z || 0);
    const px = (cos * dx - sin * dz) / scale - this.root.position.x;
    const pz = (sin * dx + cos * dz) / scale - this.root.position.z;
    let closest = Infinity;

    const ellipseDistance = (cx, cz, rx, rz) => {
      const nx = (px - cx) / rx;
      const nz = (pz - cz) / rz;
      const normalized = Math.sqrt(nx * nx + nz * nz);
      return normalized <= 1 ? 0 : (normalized - 1) * Math.min(rx, rz);
    };

    // Local-space ellipses follow the creature's shell, thorax and face.
    const bodyShapes = [
      [0, -0.46, 0.57, 0.73],
      [0, -0.47, 0.535, 0.695],
      [0, 0.135, 0.385, 0.455],
      [0, 0.13, 0.365, 0.42],
      [0, 0.445, 0.225, 0.205],
      [0, 0.60, 0.292, 0.275],
      [0, 0.775, 0.245, 0.145],
      [0, 0.755, 0.205, 0.14],
      [0, 0.885, 0.155, 0.04]
    ];
    for (const [cx, cz, rx, rz] of bodyShapes) {
      closest = Math.min(closest, ellipseDistance(cx, cz, rx, rz));
      if (closest === 0) return 0;
    }

    const segmentDistance = (ax, az, bx, bz, radius) => {
      const vx = bx - ax;
      const vz = bz - az;
      const lengthSq = vx * vx + vz * vz;
      const t = lengthSq > 0.000001
        ? THREE.MathUtils.clamp(((px - ax) * vx + (pz - az) * vz) / lengthSq, 0, 1)
        : 0;
      const sx = ax + vx * t;
      const sz = az + vz * t;
      return Math.max(0, Math.hypot(px - sx, pz - sz) - radius);
    };

    // Capsules follow the eight current leg poses and their hooked feet.
    for (const leg of this.legs) {
      const knee = leg.currentKnee || leg.hip;
      const foot = leg.currentFoot || leg.footBase;
      closest = Math.min(closest,
        segmentDistance(leg.hip.x, leg.hip.z, knee.x, knee.z, 0.075),
        segmentDistance(knee.x, knee.z, foot.x, foot.z, 0.045),
        segmentDistance(foot.x, foot.z, foot.x, foot.z, 0.060)
      );
      if (closest === 0) return 0;
    }
    return closest * scale;
  }

  intersectsHitbox(worldX, worldZ, padding = 0) {
    return this.distanceToHitbox(worldX, worldZ) <= Math.max(0, padding);
  }

  update(dt, moveSpeed = 0, mode = "roam") {
    if (this.frozen) return;
    const moving = moveSpeed > 0.15 && mode !== "hidden";
    const pace = moving ? 5.2 + Math.min(4, moveSpeed) * 0.88 : 0.72;
    this.phase += dt * pace;

    const enraged = mode === "enrage";
    const hunting = enraged || mode === "hunt";
    this.root.position.y = this.baseGroundY + (moving
      ? Math.sin(this.phase * 2) * 0.012
      : Math.sin(this.phase * 0.65) * 0.002);
    this.body.rotation.x = enraged
      ? 0.055 + Math.sin(this.phase * 3.5) * 0.028
      : moving ? Math.sin(this.phase) * 0.025 : 0.016 + Math.sin(this.phase * 1.4) * 0.008;
    this.body.rotation.z = moving
      ? Math.sin(this.phase * 0.7) * 0.018
      : Math.sin(this.phase * 1.25) * 0.012;
    this.body.scale.setScalar(enraged ? 1.025 : 1);
    // The eyes catch light like glossy cuticle rather than glowing like LEDs.
    this.eyes.emissiveIntensity = 0.08 + (hunting ? 0.07 : 0) + (enraged ? 0.08 : 0);

    for (const jaw of this.jaws) {
      const snap = enraged ? 0.12 : hunting ? 0.055 : 0;
      jaw.jaw.rotation.z =
        jaw.side * (0.035 + Math.sin(this.phase * 2.3) * 0.035 + snap);
      jaw.jaw.rotation.x =
        -0.035 + Math.sin(this.phase * 1.65) * 0.025 + snap * 0.65;
    }

    for (const leg of this.legs) {
      const phase = this.phase + leg.phase;
      const stride = moving ? Math.sin(phase) * 0.095 : Math.sin(phase) * 0.008;
      const lift = moving ? Math.max(0, Math.cos(phase)) * 0.046 : 0;
      const foot = leg.footBase.clone();
      foot.z += stride * (leg.row < 2 ? 1 : -1);
      foot.y += lift;

      const knee = new THREE.Vector3(
        (leg.hip.x + foot.x) * 0.50 + leg.side * 0.25,
        0.29 + lift * 0.28,
        (leg.hip.z + foot.z) * 0.50 + (leg.row < 2 ? 0.13 : -0.12)
      );
      leg.currentKnee = knee.clone();
      leg.currentFoot = foot.clone();
      this.between(leg.upper, leg.hip, knee);
      this.between(leg.lower, knee, foot);
      leg.knee.position.copy(knee);
      leg.kneePlate.position.copy(knee).add(new THREE.Vector3(leg.side * 0.025, 0.045, leg.row < 2 ? 0.035 : -0.035));
      leg.kneePlate.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(leg.side * 0.35, 0.88, leg.row < 2 ? 0.12 : -0.12).normalize()
      );
      const lowerMid = knee.clone().lerp(foot, 0.54);
      this.between(leg.tibialSpine,
        lowerMid.clone().add(new THREE.Vector3(0, 0.015, 0)),
        lowerMid.clone().add(new THREE.Vector3(leg.side * 0.045, 0.115, leg.row < 2 ? -0.025 : 0.025))
      );
      const toeForward = leg.row < 2 ? 0.105 : -0.09;
      const toeA = foot.clone().add(new THREE.Vector3(leg.side * 0.045, -0.008, toeForward));
      const toeB = foot.clone().add(new THREE.Vector3(-leg.side * 0.025, -0.010, toeForward * 0.72));
      this.between(leg.claws[0], foot, toeA);
      this.between(leg.claws[1], foot, toeB);
    }
  }
}
