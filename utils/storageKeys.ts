export const storageKeys = {
  loggedInUser: "loggedInUser",

  petProfileDraft: (email: string) => `petProfileDraft_${email}`,
  petProfile: (email: string) => `petProfile_${email}`,
  petProfiles: (email: string) => `petProfiles_${email}`,
  profileCompleted: (email: string) => `profileCompleted_${email}`,
  petProfileFlowMode: (email: string) => `petProfileFlowMode_${email}`,

  selectedPetId: (email: string) => `selectedPetId_${email}`,
  feedingRecords: (email: string) => `feedingRecords_${email}`,
  savedFoods: (email: string, petId: string | number) =>
    `savedFoods_${email}_${petId}`,
  feedingAlarms: (email: string, petId: string | number) =>
    `feeding_alarms_${email}_${petId}`,

  migratedPetId: (email: string) => `migrated_petId_${email}`,
};
