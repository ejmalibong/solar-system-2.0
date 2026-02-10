import * as THREE from "three";
import { createRingMesh } from "./rings";
import { createPath } from "./path";
import { loadTexture } from "./textures";
import { Label } from "./label";
import { PointOfInterest } from "./label";

import earthVertexShader from "../../static/shaders/vertex.glsl?raw";
import earthFragmentShader from "../../static/shaders/fragment.glsl?raw";
import { SUN_POSITION } from "../constants";

export interface Body {
  name: string;
  radius: number;
  distance: number;
  period: number;
  daylength: number;
  textures: TexturePaths;
  type: string;
  tilt: number;
  orbits?: string;
  labels?: PointOfInterest[];
  traversable: boolean;
  offset?: number;
}

interface TexturePaths {
  map: string;
  night?: string;
  bump?: string;
  atmosphere?: string;
  atmosphereAlpha?: string;
  specular?: string;
}

interface Atmosphere {
  map?: THREE.Texture;
  alpha?: THREE.Texture;
}

const timeFactor = 8 * Math.PI * 2; // 1s real-time => 8h simulation time

const normaliseRadius = (radius: number): number => {
  return Math.sqrt(radius) / 500;
};

const normaliseDistance = (distance: number): number => {
  return Math.pow(distance, 0.4);
};

const degreesToRadians = (degrees: number): number => {
  return (Math.PI * degrees) / 180;
};

export class PlanetaryObject {
  radius: number; // in km
  distance: number; // in million km
  period: number; // in days
  daylength: number; // in hours
  orbits?: string;
  type: string;
  tilt: number; // degrees
  mesh: THREE.Mesh;
  path?: THREE.Line;
  rng: number;
  map: THREE.Texture = new THREE.Texture();
  nightMap?: THREE.Texture;
  bumpMap?: THREE.Texture;
  specularMap?: THREE.Texture;
  atmosphere: Atmosphere = {};
  labels: Label = new Label(new THREE.Object3D(), 0);

  constructor(body: Body) {
    const { radius, distance, period, daylength, orbits, type, tilt } = body;

    this.radius = normaliseRadius(radius);
    this.distance = normaliseDistance(distance);
    this.period = period;
    this.daylength = daylength;
    this.orbits = orbits;
    this.type = type;
    this.tilt = degreesToRadians(tilt);
    this.rng = body.offset ?? Math.random() * 2 * Math.PI;

    this.loadTextures(body.textures);

    this.mesh = this.createMesh();

    if (this.orbits) {
      this.path = createPath(this.distance);
    }

    if (this.atmosphere.map) {
      this.atmosphere.map.wrapS = THREE.RepeatWrapping;
      this.atmosphere.map.wrapT = THREE.RepeatWrapping;
      this.atmosphere.map.needsUpdate = true;
    }

    this.initLabels(body.labels);
  }

  /**
   * Creates label objects for each point-of-interest.
   * @param labels - List of labels to display.
   */
  private initLabels = (labels?: PointOfInterest[]) => {
    this.labels = new Label(this.mesh, this.radius);

    if (labels) {
      labels.forEach((poi) => {
        this.labels.createPOILabel(poi);
      });
    }
  };

  /**
   * Prepare and load textures.
   * @param textures - Object of texture paths to load.
   */
  private loadTextures(textures: TexturePaths) {
    this.map = loadTexture(textures.map);
    if (textures.bump) {
      this.bumpMap = loadTexture(textures.bump);
    }
    if (textures.night) {
      this.nightMap = loadTexture(textures.night);
    }
    if (textures.specular) {
      this.specularMap = loadTexture(textures.specular);
    }
    if (textures.atmosphere) {
      this.atmosphere.map = loadTexture(textures.atmosphere);
    }
    if (textures.atmosphereAlpha) {
      this.atmosphere.alpha = loadTexture(textures.atmosphereAlpha);
    }
  }

  /**
   * Creates the main mesh object with textures.
   * @returns celestial body mesh.
   */
  private createMesh = () => {
    if (this.type === "ring") {
      return createRingMesh(this.map);
    }

    const geometry = new THREE.SphereGeometry(this.radius, 64, 64);
    let material;
    if (this.type === "star") {
      material = new THREE.MeshBasicMaterial({
        map: this.map,
        lightMapIntensity: 2,
        toneMapped: false,
        color: new THREE.Color(2.5, 2.5, 2.5),
      });
    } else if (this.nightMap) {
      material = new THREE.ShaderMaterial({
        vertexShader: earthVertexShader,
        fragmentShader: earthFragmentShader,
        uniforms: {
          uDayTexture: { value: this.map },
          uNightTexture: { value: this.nightMap },
          uCloudTexture: { value: this.atmosphere.map },
          uSunDirection: { value: new THREE.Vector3() },
          uCloudOffset: { value: 0.0 },
        },
      });
    } else {
      material = new THREE.MeshPhongMaterial({
        map: this.map,
        shininess: 5,
        toneMapped: true,
      });

      if (this.bumpMap) {
        material.bumpMap = this.bumpMap;
        material.bumpScale = this.radius / 50;
      }

      if (this.specularMap) {
        material.specularMap = this.specularMap;
      }
    }

    const sphere = new THREE.Mesh(geometry, material);
    sphere.rotation.x = this.tilt;
    sphere.castShadow = true;
    sphere.receiveShadow = true;

    return sphere;
  };

  /**
   * Creates the atmosphere mesh object with textures.
   * @returns atmosphere mesh.
   */
  private createAtmosphereMesh = () => {
    const geometry = new THREE.SphereGeometry(this.radius + 0.0005, 64, 64);

    const material = new THREE.MeshPhongMaterial({
      map: this.atmosphere?.map,
      transparent: true,
    });

    if (this.atmosphere.alpha) {
      material.alphaMap = this.atmosphere.alpha;
    }

    const sphere = new THREE.Mesh(geometry, material);
    sphere.receiveShadow = true;
    sphere.rotation.x = this.tilt;
    return sphere;
  };

  private getRotation = (elapsedTime: number) => {
    return this.daylength ? (elapsedTime * timeFactor) / this.daylength : 0;
  };

  private getOrbitRotation = (elapsedTime: number) => {
    return this.daylength ? (elapsedTime * timeFactor) / (this.period * 24) : 0;
  };

  /**
   * Updates orbital position and rotation.
   * @param elapsedTime - number of seconds elapsed.
   */
  tick = (elapsedTime: number) => {
    // Convert real-time seconds to rotation.
    const rotation = this.getRotation(elapsedTime);
    const orbitRotation = this.getOrbitRotation(elapsedTime);
    const orbit = orbitRotation + this.rng;

    // Circular rotation around orbit.
    this.mesh.position.x = Math.sin(orbit) * this.distance;
    this.mesh.position.z = Math.cos(orbit) * this.distance;

    if (this.type === "ring") {
      this.mesh.rotation.z = rotation;
    } else {
      this.mesh.rotation.y = rotation;
    }
    if ((this.mesh.material as any).uniforms?.uSunDirection) {
      const dir = new THREE.Vector3()
        .subVectors(this.mesh.position, SUN_POSITION)
        .normalize();

      (this.mesh.material as any).uniforms.uSunDirection.value.copy(dir);
    }
    if ((this.mesh.material as any).uniforms?.uCloudOffset) {
      (this.mesh.material as any).uniforms.uCloudOffset.value += 0.00005;
    }
  };

  /**
   * @returns the minimum orbital control camera distance allowed.
   */
  getMinDistance = (): number => {
    return this.radius * 3.5;
  };
}
