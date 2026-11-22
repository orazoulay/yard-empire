// Unit shapes that more than one part of the scenery is made of, each made once: the city's edge (js/gfx/cityedge.js)
// and the Workers' Park (js/park.js) scale and place them, and join them into their meshes.
import * as THREE from 'three';

/** Mark a shape as shared: whoever joins or clears a mesh made with it leaves it alone. */
export const share = geo => { geo.userData.shared = true; return geo; };
/** A shape whose every corner takes the middle of the block picture, where it is not shaded toward an edge. */
export const plain = geo => { geo.attributes.uv.array.fill(0.5); return share(geo); };
/** A square one unit large that lies on the ground and faces up: paving, paint. */
export const FLAT = share(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
/** A ball one unit in radius with flat faces, like the trees of the forest: a crown, a flower, a lamp. */
export const BALL = plain(new THREE.IcosahedronGeometry(1, 0));
