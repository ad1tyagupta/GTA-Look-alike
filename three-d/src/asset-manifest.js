const manifest = {
  buildings: {
    apartment: { id: "apartment", label: "Apartment Building", path: "../../assets/3d/buildings/Apartment building.glb", category: "residential" },
    townHouse: { id: "townHouse", label: "Town House", path: "../../assets/3d/buildings/Town House.glb", category: "residential" },
    office: { id: "office", label: "Office Block", path: "../../assets/3d/buildings/Building.glb", category: "downtown" },
    hospital: { id: "hospital", label: "Hospital", path: "../../assets/3d/buildings/Hospital.glb", category: "downtown" },
    skyscraper: { id: "skyscraper", label: "Skyscraper", path: "../../assets/3d/buildings/Skyscraper.glb", category: "downtown" },
    factory: { id: "factory", label: "Factory", path: "../../assets/3d/buildings/Factory.glb", category: "industrial" },
    factoryAlt: { id: "factoryAlt", label: "Factory Alt", path: "../../assets/3d/buildings/Factory (1).glb", category: "industrial" },
  },
  roads: {
    boulevard: { id: "boulevard", label: "Street Straight", path: "../../assets/3d/roads/Street Straight.glb", forwardAxis: "z" },
    blockStreet: { id: "blockStreet", label: "Road Segment", path: "../../assets/3d/roads/Road.glb", forwardAxis: "z" },
    modularKit: { id: "modularKit", label: "Modular Road Kit", path: "../../assets/3d/roads/Modular Road Kit.glb", forwardAxis: "z" },
  },
  vehicles: {
    policeCar: { id: "policeCar", label: "Police Car", path: "../../assets/3d/vehicles/Police Car.glb" },
    pickup: { id: "pickup", label: "Pickup Truck", path: "../../assets/3d/vehicles/Pickup Truck.glb" },
    van: { id: "van", label: "Van", path: "../../assets/3d/vehicles/Van.glb" },
    muscle: { id: "muscle", label: "Dodge Challenger", path: "../../assets/3d/vehicles/2015 Dodge Challenger.glb" },
    hatchback: { id: "hatchback", label: "Golf Hatchback", path: "../../assets/3d/vehicles/volkswagen_golf_gti_mk2_low_poly.glb" },
    ambulance: { id: "ambulance", label: "Ambulance", path: "../../assets/3d/vehicles/Ambulance.glb" },
  },
  guns: {
    pistol: { id: "pistol", label: "Pistol", path: "../../assets/3d/guns/Pistol.glb" },
    rifle: { id: "rifle", label: "Assault Rifle", path: "../../assets/3d/guns/Assault Rifle.glb" },
  },
  characters: {
    player: { id: "player", label: "Punk", path: "../../assets/3d/characters/Punk.glb" },
    civilianA: { id: "civilianA", label: "Business Man", path: "../../assets/3d/characters/Business Man.glb" },
    civilianB: { id: "civilianB", label: "Animated Woman", path: "../../assets/3d/characters/Animated Woman.glb" },
    civilianC: { id: "civilianC", label: "Woman in Dress", path: "../../assets/3d/characters/Woman in Dress.glb" },
    guard: { id: "guard", label: "SWAT", path: "../../assets/3d/characters/SWAT.glb" },
    soldier: { id: "soldier", label: "Soldier", path: "../../assets/3d/characters/Soldier.glb" },
  },
};

const initialSceneSelection = {
  buildings: ["apartment", "townHouse", "office", "hospital", "skyscraper", "factory", "factoryAlt"],
  roads: ["boulevard", "blockStreet", "modularKit"],
  vehicles: ["policeCar", "pickup", "van", "muscle", "ambulance", "hatchback"],
  guns: ["pistol", "rifle"],
  characters: ["player", "civilianA", "civilianB", "civilianC", "guard", "soldier"],
};

export const ASSET_MANIFEST = manifest;

export function getAssetManifest() {
  return manifest;
}

export function getInitialSceneSelection() {
  return initialSceneSelection;
}

export function resolveAssetUrl(relativePath) {
  return new URL(relativePath, import.meta.url).href;
}
