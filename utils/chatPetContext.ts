import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { storageKeys } from "./storageKeys";

const diseaseMapReverse: Record<string, string> = {
  kidney_disease: "신장 질환",
  heart_disease: "심장 질환",
  diabetes: "당뇨",
  pancreatitis: "췌장염",
  arthritis: "관절염",
  hypothyroidism: "갑상선 기능 저하증",
  hyperthyroidism: "갑상선 기능 항진증",
  urinary_disease: "요로 질환",
  none: "없음",
};

export type LastFeedAnalysisSnapshot = {
  petId: string;
  petName: string;
  analyzedAt: string;
  foodInfo: {
    brand?: string | null;
    product_name?: string | null;
    calories_per_100g?: number | null;
    main_ingredients?: string[] | null;
    protein_pct?: number | null;
    fat_pct?: number | null;
    confidence?: number;
  };
  feeding: {
    daily_grams?: number;
    meals_per_day?: number;
    grams_per_meal?: number;
    daily_kcal?: number;
    recommendation?: string;
    ingredient_warnings?: string[];
  };
};

type LocalProfile = {
  name?: string;
  age?: string;
  weight?: string;
  gender?: string;
  petType?: string;
  bcs?: string;
  diseases?: string[];
  serverPetId?: number | string;
};

type ServerPet = Record<string, unknown>;

function getGoServerUrl(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_GO_SERVER_URL || "").trim();
  const extra = Constants.expoConfig?.extra as
    | { goServerUrl?: string }
    | undefined;
  const fromExtra =
    typeof extra?.goServerUrl === "string" ? extra.goServerUrl.trim() : "";
  return (fromEnv || fromExtra).replace(/\/+$/, "");
}

function speciesLabel(species: unknown, local?: LocalProfile): string {
  if (species === "Dog") return "강아지";
  if (species === "Cat") return "고양이";
  if (typeof species === "string" && species.trim()) return species;
  return local?.petType || "";
}

function genderLabel(gender: unknown, local?: LocalProfile): string {
  if (local?.gender) return local.gender;
  const g = String(gender ?? "").toUpperCase();
  if (g === "M") return "남";
  if (g === "F") return "여";
  if (g === "U") return "중성화";
  if (typeof gender === "string" && gender.trim()) return gender;
  return "";
}

function formatAgeFromServer(age: unknown, local?: LocalProfile): string {
  if (typeof age === "string" && age.trim()) return age;
  if (typeof age === "number" && age > 0) {
    const years = Math.floor(age / 12);
    const months = age % 12;
    if (years > 0 && months > 0) return `${years}년 ${months}개월`;
    if (years > 0) return `${years}년`;
    return `${months}개월`;
  }
  return local?.age || "";
}

function diseasesFromServerPet(
  pet: ServerPet,
  local?: LocalProfile,
): string[] {
  const fromArray = pet.diseases;
  if (Array.isArray(fromArray) && fromArray.length > 0) {
    return fromArray.map((d) => {
      const key = String(d);
      return diseaseMapReverse[key] || key;
    });
  }

  const hs = pet.health_status;
  if (typeof hs === "string" && hs && hs !== "none") {
    return [diseaseMapReverse[hs] || hs];
  }

  if (local?.diseases?.length) {
    return local.diseases.filter((d) => d !== "없음");
  }

  return ["없음"];
}

function bcsLabelFromServer(pet: ServerPet, local?: LocalProfile): string {
  if (local?.bcs) return local.bcs;
  if (typeof pet.bcs === "string" && pet.bcs.trim()) return pet.bcs;
  const n =
    typeof pet.bcs_score === "number"
      ? pet.bcs_score
      : Number(pet.bcs_score);
  const map: Record<number, string> = {
    1: "심한 저체중",
    2: "저체중",
    3: "정상",
    4: "과체중",
    5: "비만",
  };
  if (Number.isFinite(n) && map[n]) return map[n];
  return "정상";
}

/** GET /api/v1/users/{userId}/pets — same API as home / 사료 분석. */
export async function fetchPetsFromServer(
  serverUserId: number,
): Promise<ServerPet[]> {
  const base = getGoServerUrl();
  if (!base) {
    console.warn("[chatPetContext] EXPO_PUBLIC_GO_SERVER_URL is not set");
    return [];
  }

  const url = `${base}/api/v1/users/${serverUserId}/pets`;
  const res = await fetch(url, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(
      `[chatPetContext] pets API ${res.status}:`,
      text || res.statusText,
    );
    return [];
  }

  const data = await res.json();
  const pets = Array.isArray(data) ? data : data?.pets || [];
  console.log(`[chatPetContext] loaded ${pets.length} pet(s) from server`);
  return pets as ServerPet[];
}

export async function saveLastFeedAnalysis(
  email: string,
  snapshot: LastFeedAnalysisSnapshot,
): Promise<void> {
  await AsyncStorage.setItem(
    storageKeys.lastFeedAnalysis(email, snapshot.petId),
    JSON.stringify(snapshot),
  );
}

export async function loadLastFeedAnalysis(
  email: string,
  petId: string,
): Promise<LastFeedAnalysisSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(
      storageKeys.lastFeedAnalysis(email, petId),
    );
    if (!raw) return null;
    return JSON.parse(raw) as LastFeedAnalysisSnapshot;
  } catch {
    return null;
  }
}

function formatFeedAnalysisBlock(s: LastFeedAnalysisSnapshot): string {
  const fi = s.foodInfo;
  const fd = s.feeding;
  const lines = [
    `Last feed analysis (사료 분석) for ${s.petName} at ${s.analyzedAt}:`,
    `- Product: ${fi.product_name || fi.brand || "unknown"}`,
    fi.brand ? `- Brand: ${fi.brand}` : null,
    fi.protein_pct != null ? `- Protein: ${fi.protein_pct}%` : null,
    fi.fat_pct != null ? `- Fat: ${fi.fat_pct}%` : null,
    fi.calories_per_100g != null
      ? `- Calories: ${fi.calories_per_100g} kcal per 100g`
      : null,
    fi.main_ingredients?.length
      ? `- Main ingredients: ${fi.main_ingredients.join(", ")}`
      : null,
    fd.daily_grams != null ? `- Recommended daily amount: ${fd.daily_grams}g` : null,
    fd.grams_per_meal != null
      ? `- Per meal (${fd.meals_per_day ?? "?"} meals/day): ${fd.grams_per_meal}g`
      : null,
    fd.daily_kcal != null ? `- Daily kcal: ${fd.daily_kcal}` : null,
    fd.recommendation ? `- Recommendation: ${fd.recommendation}` : null,
    fd.ingredient_warnings?.length
      ? `- Warnings: ${fd.ingredient_warnings.join("; ")}`
      : null,
  ];
  return lines.filter(Boolean).join("\n");
}

function formatPetLine(
  pet: ServerPet,
  local: LocalProfile | undefined,
  isSelected: boolean,
): string {
  const id = String(pet.pet_id ?? pet.id ?? "");
  const name = String(pet.name ?? local?.name ?? "이름 없음");
  const species = speciesLabel(pet.species, local);
  const age = formatAgeFromServer(pet.age, local);
  const weightRaw = pet.current_weight ?? pet.weight ?? local?.weight;
  const weight =
    weightRaw != null && String(weightRaw).trim() !== ""
      ? `${weightRaw}`
      : "";
  const gender = genderLabel(pet.gender, local);
  const bcs = bcsLabelFromServer(pet, local);
  const diseases = diseasesFromServerPet(pet, local);
  const diseaseText =
    diseases.filter((d) => d !== "없음").join(", ") || "없음";

  return [
    `${isSelected ? "[CURRENTLY SELECTED] " : ""}Pet: ${name} (server id ${id || "?"})`,
    `  Species: ${species || "unknown"}`,
    age ? `  Age: ${age}` : null,
    weight ? `  Weight: ${weight} kg` : null,
    gender ? `  Gender: ${gender}` : null,
    `  BCS (body condition): ${bcs}`,
    `  Diseases / health: ${diseaseText}`,
    pet.breed ? `  Breed: ${pet.breed}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Loads pets from Go server, merges missing fields from local profile cache,
 * and returns text injected into the chatbot system instruction.
 */
export async function buildChatPetContextBlock(): Promise<string> {
  try {
    const savedUser = await AsyncStorage.getItem(storageKeys.loggedInUser);
    if (!savedUser) {
      return "No logged-in user. Do not invent pet names or medical history.";
    }

    const parsedUser = JSON.parse(savedUser) as {
      email?: string;
      serverUserId?: number;
    };
    const email = parsedUser.email;
    const serverUserId = parsedUser.serverUserId;

    if (!email) {
      return "No user email on file. Do not invent pet profiles.";
    }

    if (!serverUserId) {
      return (
        "User is not linked to the backend (no serverUserId). " +
        "Tell them to log in again after signup so pet data can sync from the server."
      );
    }

    let localProfiles: LocalProfile[] = [];
    try {
      const rawProfiles = await AsyncStorage.getItem(storageKeys.petProfiles(email));
      localProfiles = rawProfiles ? JSON.parse(rawProfiles) : [];
    } catch {
      localProfiles = [];
    }

    const selectedPetId =
      (await AsyncStorage.getItem(storageKeys.selectedPetId(email))) || "";

    let serverPets = await fetchPetsFromServer(serverUserId);

    if (serverPets.length === 0 && localProfiles.length > 0) {
      console.warn(
        "[chatPetContext] server returned no pets; using local profiles only",
      );
      serverPets = localProfiles.map((p) => ({
        pet_id: p.serverPetId ?? p.name,
        name: p.name,
        species: p.petType === "고양이" ? "Cat" : "Dog",
        age: p.age,
        current_weight: p.weight,
        gender: p.gender,
        bcs_score: p.bcs,
        diseases: p.diseases,
      }));
    }

    if (serverPets.length === 0) {
      return (
        "No pets found on server for this account. " +
        "If the user asks about their pet, say no registered pet was found and suggest adding a pet in Profile."
      );
    }

    const petLines: string[] = [];
    let selectedName = "";

    for (const pet of serverPets) {
      const id = String(pet.pet_id ?? pet.id ?? "");
      const local = localProfiles.find(
        (p) =>
          String(p.serverPetId ?? "") === id ||
          (p.name && p.name === pet.name),
      );
      const isSelected = selectedPetId && id ? id === selectedPetId : false;
      if (isSelected) {
        selectedName = String(pet.name ?? local?.name ?? "");
      }
      petLines.push(formatPetLine(pet, local, isSelected));
    }

    if (!selectedName && serverPets[0]) {
      selectedName = String(serverPets[0].name ?? "");
    }

    let feedBlock = "";
    const petIdForAnalysis =
      selectedPetId || String(serverPets[0]?.pet_id ?? serverPets[0]?.id ?? "");
    if (petIdForAnalysis) {
      const lastAnalysis = await loadLastFeedAnalysis(email, petIdForAnalysis);
      if (lastAnalysis) {
        feedBlock = "\n\n" + formatFeedAnalysisBlock(lastAnalysis);
      }
    }

    return (
      "REGISTERED PET DATA (loaded from Go server GET /api/v1/users/{userId}/pets — authoritative):\n" +
      petLines.join("\n\n") +
      feedBlock +
      "\n\nWhen the user asks about pet name, weight, age, species, BCS, or diseases: answer ONLY from the data above. " +
      `Default pet for "my pet" questions: "${selectedName || "first pet in list"}". ` +
      "For 사료 분석 questions, use the Last feed analysis section if present. " +
      "Never invent data not listed here."
    );
  } catch (e) {
    console.warn("buildChatPetContextBlock failed:", e);
    return "Could not load pet data from server. Suggest checking login and EXPO_PUBLIC_GO_SERVER_URL.";
  }
}
