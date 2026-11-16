const ISFILLED = 2 ** 30

function subtractAABBFace(A1, A2, N) {
    // Determine the normal axis and the two tangential axes.
    const axes = ["x", "y", "z"];
    const normalAxis = axes.find(axis => N[axis] !== 0);

    if (!normalAxis || axes.some(axis =>
        axis !== normalAxis && N[axis] !== 0
    )) {
        throw new Error("N must be an axis-aligned normal.");
    }

    const tangentAxes = axes.filter(axis => axis !== normalAxis);
    const [u, v] = tangentAxes;

    // Determine which face of A1 is facing A2.
    const face = N[normalAxis] > 0
        ? A1.max[normalAxis]
        : A1.min[normalAxis];

    // Check whether A2 actually touches that face.
    const touches = N[normalAxis] > 0
        ? A2.min[normalAxis] === face
        : A2.max[normalAxis] === face;

    // No contact means the entire face is uncovered.
    if (!touches) {
        return [{
            min: { ...A1.min, [normalAxis]: face },
            max: { ...A1.max, [normalAxis]: face }
        }];
    }

    // Project A1 and A2 onto the two tangential axes.
    const aMinU = A1.min[u];
    const aMaxU = A1.max[u];
    const aMinV = A1.min[v];
    const aMaxV = A1.max[v];

    // Clamp A2's projected rectangle to A1's face.
    const bMinU = Math.max(aMinU, A2.min[u]);
    const bMaxU = Math.min(aMaxU, A2.max[u]);
    const bMinV = Math.max(aMinV, A2.min[v]);
    const bMaxV = Math.min(aMaxV, A2.max[v]);

    // No overlapping area: return the entire face.
    if (bMinU >= bMaxU || bMinV >= bMaxV) {
        return [{
            min: { ...A1.min, [normalAxis]: face },
            max: { ...A1.max, [normalAxis]: face }
        }];
    }

    const quads = [];

    // Helper to construct a 3D bounding quad.
    function addQuad(minU, maxU, minV, maxV) {
        if (minU >= maxU || minV >= maxV) return;

        const min = { ...A1.min, [normalAxis]: face };
        const max = { ...A1.max, [normalAxis]: face };

        min[u] = minU;
        max[u] = maxU;
        min[v] = minV;
        max[v] = maxV;

        quads.push({ min, max });
    }

    // 1. Left strip.
    addQuad(aMinU, bMinU, aMinV, aMaxV);

    // 2. Right strip.
    addQuad(bMaxU, aMaxU, aMinV, aMaxV);

    // 3. Bottom strip (between the left/right boundaries).
    addQuad(bMinU, bMaxU, aMinV, bMinV);

    // 4. Top strip (between the left/right boundaries).
    addQuad(bMinU, bMaxU, bMaxV, aMaxV);

    return quads;
}

function assembleQuad(bounds, normal){

if(normal == 0){

  let pos = {x: bounds.upper.x-1, y: bounds.lower.y, z:bounds.lower.z}
  let width = bounds.upper.y - bounds.lower.y
  let height = bounds.upper.z - bounds.lower.z
  return {position:pos, width:width,height:height}

}

if(normal == 1){

  let pos = {x: bounds.lower.x, y: bounds.upper.y - 1, z:bounds.lower.z}
  let width = bounds.upper.y - bounds.lower.y
  let height = bounds.upper.z - bounds.lower.z
  return {position:pos, width:width,height:height}

}

if(normal == 2){

  let pos = {x: bounds.lower.x, y: bounds.lower.y, z:bounds.lower.z}
  let width = bounds.upper.x - bounds.lower.x
  let height = bounds.upper.z - bounds.lower.z
  return {position:pos, width:width,height:height}

}

if(normal == 3){

  let pos = {x: bounds.lower.x, y: bounds.upper.y-1, z:bounds.upper.z-1}
  let width = bounds.upper.x - bounds.lower.x
  let height = bounds.upper.z - bounds.lower.z
  return {position:pos, width:width,height:height}

}

if(normal == 4){

  let pos = {x: bounds.lower.x, y: bounds.lower.y, z:bounds.upper.z-1}
  let width = bounds.upper.x - bounds.lower.x
  let height = bounds.upper.y - bounds.lower.y
    return {position:pos, width:width,height:height}

}

if(normal == 5){

  let pos = {x: bounds.upper.x-1, y: bounds.lower.y, z:bounds.lower.z}
  let width = bounds.upper.x - bounds.lower.x
  let height = bounds.upper.y - bounds.lower.y
  return {position:pos, width:width,height:height}

}

}

function packQuadNew(x, y, z, normal, width, height) {
    return (
        (x      & 0x1F)       |
        ((y     & 0x1F) << 5) |
        ((z     & 0x1F) << 10) |
        ((normal & 0x1F) << 15) |
        (((width-1)  & 0x1F) << 20) |
        (((height-1) & 0x1F) << 25)
    ) >>> 0;
}

function packBounds(lower,upper){

  return (
    (lower.x & 0x1F)       |
        ((lower.y     & 0x1F) << 5) |
        ((lower.z     & 0x1F) << 10) |
        ((upper.x-1 & 0x1F) << 15) |
        (((upper.y-1)  & 0x1F) << 20) |
        (((upper.z-1) & 0x1F) << 25) |
        (1 << 30)



  ) >>>0;

}

class LODChunk {

  constructor(size, scale = {x:1,y:1,z:1}, position={x:0,y:0,z:0}){

    this.size = size
    this.scale = scale
    this.position = position

    this.LODCount = {x:Math.ceil(Math.log2(size.x)), y:Math.ceil(Math.log2(size.y)), z: Math.ceil(Math.log2(size.z))}
    this.LODConfigs = this.LODCount.x * this.LODCount.y * this.LODCount.z

    this.voxelArray = new Array(this.LODConfigs)
    this.instanceArray =  new Array(this.LODConfigs)
    this.quadCounts = new Array(this.LODConfigs)
    this.updateList = new Array(this.LODConfigs)

    let i = 0
    for(let x = 0; x< this.LODCount.x; x++){

      for(let y = 0; y< this.LODCount.y; y++){

        for(let z = 0; z< this.LODCount.z; z++){

          let sx = this.LODCount.x - x
          let sy = this.LODCount.y - y
          let sz = this.LODCount.z - z
          this.voxelArray[i] = new Uint32Array((2 ** sx) * (2 ** sy) * (2 ** sz));
          this.instanceArray[i] = new Uint32Array((2 ** sx) * (2 ** sy) * (2 ** sz)* 6);
          i++
        }
      }
    }
  }

  isValidCoordinate(cell, lod) {
      return (
        cell.x >= 0 && cell.x < this.size.x / (2 ** lod.x) &&
        cell.y >= 0 && cell.y < this.size.y / (2 ** lod.y) &&
        cell.z >= 0 && cell.z < this.size.z / (2 ** lod.z)
      );
    }

  getIndex(cell, lod) {
      return {
        index: cell.z + cell.y * this.size.z / (2 ** lod.z) + cell.x * (this.size.y / (2 ** lod.y)) * (this.size.z / (2 ** lod.z)),
        arrayElement: lod.z + lod.y * this.LODCount.z + lod.x * this.LODCount.y * this.LODCount.z
      }
      
    }

  setVoxel(cell,lod, value){

    if(this.isValidCoordinate(cell,lod)){
      let index = this.getIndex(cell,lod)
      this.voxelArray[index.arrayElement][index.index] = value
    }
  }

  getVoxel(cell, lod){

    if(this.isValidCoordinate(cell,lod)){
      let index = this.getIndex(cell,lod)
      return this.voxelArray[index.arrayElement][index.index]
    }
    return null
  }
  updateLOD(LOD, fillRate){

    let LODScale = 
    {
      x:2 ** (this.LODCount.x - LOD.x - 0),
      y:2 ** (this.LODCount.y - LOD.y - 0),
      z:2 ** (this.LODCount.z - LOD.z - 0)
    }

    for (let x = 0; x < LODScale.x; x++) {
      for (let y = 0; y < LODScale.y; y++) {
        for (let z = 0; z < LODScale.z; z++) {
          
          let fx = x * (2 ** LOD.x)
          let fy = y * (2 ** LOD.y)
          let fz = z * (2 ** LOD.z)


          let regionFineLower = {x: fx, y:fy, z:fz}
          let regionFineUpper = {x: fx + (2 ** LOD.x), y: fy + (2 ** LOD.y), z: fz + (2 ** LOD.z)}
          let coarseArea = (2 ** LOD.x) * (2 ** LOD.y) * (2 ** LOD.z)
          let filledArea = 0;

          let minimumBounds = {x:Infinity,y:Infinity,z:Infinity}
          let maximumBounds = {x:0,y:0,z:0}

          for(let ux = regionFineLower.x; ux< regionFineUpper.x; ux++){

            for(let uy = regionFineLower.y; uy< regionFineUpper.y; uy++){

              for(let uz = regionFineLower.z; uz< regionFineUpper.z; uz++){

                let filledVoxel = this.getVoxel({x: ux, y: uy, z:uz}, {x:0, y:0, z:0})

                if(filledVoxel >= ISFILLED){

                filledArea += 1
                minimumBounds.x = Math.min(minimumBounds.x, ux)
                minimumBounds.y = Math.min(minimumBounds.y, uy)
                minimumBounds.z = Math.min(minimumBounds.z, uz)

                maximumBounds.x = Math.max(maximumBounds.x, ux + 1)
                maximumBounds.y = Math.max(maximumBounds.y, uy + 1)
                maximumBounds.z = Math.max(maximumBounds.z, uz + 1)

                }         
              }
            }
          }

          filledArea /= coarseArea

          if(filledArea >= fillRate){

            let packingBounds = packBounds(minimumBounds, maximumBounds)
            this.setVoxel({x:x, y:y, z:z}, LOD, packingBounds);

          }
        }
      }
    }
  }

  getAdjacentVoxel(cell, lod, normal) {
      const adjacentX = cell.x - normal.x;
      const adjacentY = cell.y - normal.y;
      const adjacentZ = cell.z - normal.z;
      if (this.isValidCoordinate({x:adjacentX, y:adjacentY, z:adjacentZ}, lod)) {
        return { x: adjacentX, y: adjacentY, z: adjacentZ };
      }
      return null;
    }

  updateInstanceData(lod) {
    let lodIndex = lod.z + lod.y * this.LODCount.z + lod.x * this.LODCount.y * this.LODCount.z
    let count = 0;
    let LODSize = {
      x: this.size.x / (2 ** lod.x),
      y: this.size.y / (2 ** lod.y),
      z: this.size.z / (2 ** lod.z)
    }

    for (let x = 0; x < LODSize.x; x++) {
      for (let y = 0; y < LODSize.y; y++) {
        for (let z = 0; z < LODSize.z; z++) {
          if (this.getVoxel({x:x,y:y,z:z}, lod) >= ISFILLED) {

            let vox = this.getVoxel({x:x,y:y,z:z}, lod);

            for (let i = 0; i < 6; i++) {
              const normal = NORMALS[i];
              const adjacent = this.getAdjacentVoxel({x:x,y:y,z:z}, lod, normal);
              let adjVox =false;

              if(adjacent){
                adjVox = this.getVoxel(adjacent,lod);
              }

              let objVox = {
                  lower: {
                    x: vox & 0x1F,
                    y: (vox>>>5)  & 0x1F,
                    z: (vox>>>10)  & 0x1F
                  },
                  upper:{
                    x: 1+((vox>>>15) & 0x1F),
                    y: 1+((vox>>>20)  & 0x1F),
                    z: 1+((vox>>>25)  & 0x1F)
                  }
                }

              let neighborVox = {

                min: {

                  x: adjVox & 0x1F,
                  y: (adjVox>>>5)  & 0x1F,
                  z: (adjVox>>>10)  & 0x1F

                },
                max:{

                  x: 1+((adjVox>>>15) & 0x1F),
                  y: 1+((adjVox>>>20)  & 0x1F),
                  z: 1+((adjVox>>>25)  & 0x1F)

                }

              }

              let uObj = {

                min: {

                  x: vox & 0x1F,
                  y: (vox>>>5)  & 0x1F,
                  z: (vox>>>10)  & 0x1F

                },
                max:{

                  x: 1+((vox>>>15) & 0x1F),
                  y: 1+((vox>>>20)  & 0x1F),
                  z: 1+((vox>>>25)  & 0x1F)

                }

              }

              let fill = true;
              let altNormal = {x:-normal.x,y:-normal.y,z:-normal.z}
              let separation = subtractAABBFace(uObj, neighborVox, altNormal)
              fill = separation.length>0;

              if(lod.x ==0 && lod.y==0 && lod.z==0){
                fill=true
              }
              
              if (!adjacent || !(this.getVoxel(adjacent, lod)) || fill) {
                let qx = x * (2** lod.x)
                let qy = y * (2** lod.y)
                let qz = z * (2** lod.z)
                let obj = {
                  lower:{x:qx,y:qy,z:qz}, 
                  upper:{x:qx+ (2** lod.x) ,y:qy+ (2** lod.y),z:qz+ (2** lod.z)}
                }

                let assm = assembleQuad(objVox,i)
                if(lod.x ==0 && lod.y ==0 && lod.z==0){
                  assm = assembleQuad(obj,i)
                }

                let pack = packQuadNew(assm.position.x,assm.position.y,assm.position.z,i, assm.width,assm.height)
                this.instanceArray[lodIndex][count] = pack;
                count++;
              }
            }
          }
        }
      }
    }
    this.quadCounts[lodIndex] = count;
  }

  updateLODSByPosition(position){

    let distance = Math.sqrt(
    Math.pow(position[0] - this.position.x - 16, 2) + 
    Math.pow(position[1] - this.position.y - 16, 2) + 
    Math.pow(position[2] - this.position.z - 16, 2)
  );

  let usedLOD = {
    x:Math.floor(Math.max(Math.log2(distance/64 + Math.abs(position[0] - this.position.x - 16)/16),0)),
    y:Math.floor(Math.max(Math.log2(distance/64 + Math.abs(position[1] - this.position.y - 16)/16),0)),
    z:Math.floor(Math.max(Math.log2(distance/64 + Math.abs(position[2] - this.position.z - 16)/16),0))
  }

  usedLOD.x = Math.min(usedLOD.x,this.LODCount.x-1)
  usedLOD.y = Math.min(usedLOD.y,this.LODCount.y-1)
  usedLOD.z = Math.min(usedLOD.z,this.LODCount.z-1)

  if(!lodChunk.updateList[instanceSet.arrayElement]){
      
    lodChunk.updateLOD(usedLOD, fillRate)
    lodChunk.updateInstanceData(usedLOD)
    lodChunk.updateList[instanceSet.arrayElement] = true
    //alert("updated")
  }

  }
  
}

const CHUNK_SIZE = {x:32,y:32,z:32}
const NORMALS = [
  {x:-1, y:0,z:0},
  {x:1, y:0,z:0},
  
  {x:0, y:1,z:0},
  {x:0, y:-1,z:0},

  {x:0, y:0,z:-1},
  {x:0, y:0,z:1},
  
]

function loadVoxel(x,y,z){

  
  //return x+y+z==0
  //return Math.random()>0.9
  //return x%4+y%4+z%4==0
  //return x%2+y%2+z%2==1;
  //return x %2==0;
 return x%2+y%2+z%2==0;
  return (Math.floor(x/2)%2 === 0 && Math.floor(y/2)%2==0 && Math.floor(z/2)%2===0) || x==31

}

const lodChunk = new LODChunk(CHUNK_SIZE)

for (let x = 0; x < CHUNK_SIZE.x; x++) {
  for (let y = 0; y < CHUNK_SIZE.y; y++) {
    for (let z = 0; z < CHUNK_SIZE.z; z++) {
      if (loadVoxel(x,y,z)) {

        lodChunk.setVoxel({x:x,y:y,z:z},{x:0,y:0,z:0},ISFILLED)


      }
    }
  }
}

export { lodChunk};