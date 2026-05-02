export const storageKeys = {
  petProfileDraft: (email: string) => `petProfileDraft_${email}`,
  petProfile: (email: string) => `petProfile_${email}`,
  petProfiles: (email: string) => `petProfiles_${email}`,
  profileCompleted: (email: string) => `profileCompleted_${email}`,
  petProfileFlowMode: (email: string) => `petProfileFlowMode_${email}`,

  selectedPetId: (email: string) => `selectedPetId_${email}`,
  feedingRecords: (email: string) => `feedingRecords_${email}`,
  feedingAlarms: (email: string, petId: string) =>
    `feeding_alarms_${email}_${petId}`,
};
