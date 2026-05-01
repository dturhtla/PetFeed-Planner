import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Pet = {
  id: string;
  name: string;
  petType?: "강아지" | "고양이" | "";
};

const menuList = [
  { title: "사료 분석", icon: "nutrition-outline", route: "/camera-upload" },
  { title: "급여 기록", icon: "clipboard-outline", route: "/records" },
  { title: "AI 챗봇", icon: "chatbubble-ellipses-outline", route: "/chatbot" },
];

const getProfilesKey = (email: string) => `petProfiles_${email}`;
const getSelectedPetKey = (email: string) => `selectedPetId_${email}`;

export default function HomeScreen() {
  const router = useRouter();
  const lastBackPress = useRef(0);
  const listRef = useRef<FlatList<Pet>>(null);

  const [isNavigating, setIsNavigating] = useState(false);

  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [petSheetVisible, setPetSheetVisible] = useState(false);

  const selectedPet = pets.find((pet) => pet.id === selectedPetId) ?? pets[0];

  const renderPetIcon = (petType?: Pet["petType"], size = 22) => {
    if (petType === "고양이") {
      return <Ionicons name="logo-octocat" size={size} color="#111" />;
    }

    return <Ionicons name="paw" size={size} color="#111" />;
  };

  const loadSelectedPet = useCallback(async () => {
    try {
      const savedUser = await AsyncStorage.getItem("loggedInUser");

      if (!savedUser) {
        setPets([]);
        setSelectedPetId(null);
        router.replace("/" as any);
        return;
      }

      const parsedUser = JSON.parse(savedUser);
      const email = parsedUser.email;

      const savedProfiles = await AsyncStorage.getItem(getProfilesKey(email));
      const parsedProfiles = savedProfiles ? JSON.parse(savedProfiles) : [];

      const loadedPets: Pet[] = parsedProfiles.map(
        (profile: any, index: number) => ({
          id: String(index),
          name: profile.name,
          petType: profile.petType,
        }),
      );

      setPets(loadedPets);

      if (loadedPets.length === 0) {
        setSelectedPetId(null);
        return;
      }

      const savedPetId = await AsyncStorage.getItem(getSelectedPetKey(email));

      if (savedPetId && loadedPets.some((pet) => pet.id === savedPetId)) {
        setSelectedPetId(savedPetId);
        return;
      }

      setSelectedPetId(loadedPets[0].id);
      await AsyncStorage.setItem(getSelectedPetKey(email), loadedPets[0].id);
    } catch (error) {
      console.log(error);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      loadSelectedPet();

      const onBackPress = () => {
        const now = Date.now();

        if (now - lastBackPress.current < 2000) {
          BackHandler.exitApp();
          return true;
        }

        lastBackPress.current = now;
        ToastAndroid.show("한 번 더 누르면 종료됩니다", ToastAndroid.SHORT);
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );

      return () => subscription.remove();
    }, [loadSelectedPet]),
  );

  const moveTo = (route: string) => {
    if (isNavigating) return;

    setIsNavigating(true);
    router.push(route as any);

    setTimeout(() => {
      setIsNavigating(false);
    }, 500);
  };

  const openPetSheet = () => {
    setPetSheetVisible(true);

    setTimeout(() => {
      const index = pets.findIndex((pet) => pet.id === selectedPetId);

      if (index >= 0) {
        listRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
      }
    }, 200);
  };

  const handleSelectPet = async (pet: Pet) => {
    try {
      const savedUser = await AsyncStorage.getItem("loggedInUser");
      if (!savedUser) return;

      const parsedUser = JSON.parse(savedUser);
      const email = parsedUser.email;

      setSelectedPetId(pet.id);
      await AsyncStorage.setItem(getSelectedPetKey(email), pet.id);

      setPetSheetVisible(false);
      ToastAndroid.show(`${pet.name}으로 변경되었습니다`, ToastAndroid.SHORT);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.settingButton}
          onPress={() => moveTo("/settings")}
        >
          <Ionicons name="settings-outline" size={24} color="#2F6B57" />
        </TouchableOpacity>

        <View style={styles.titleArea}>
          <View style={styles.logoRow}>
            <Text style={styles.logo}>PetFeed Planner</Text>

            <TouchableOpacity style={styles.petDropdown} onPress={openPetSheet}>
              <View style={styles.headerPetIconCircle}>
                {renderPetIcon(selectedPet?.petType, 18)}
              </View>
              <Text style={styles.petName}>
                {selectedPet?.name ?? "반려동물"}
              </Text>
              <Ionicons name="caret-down" size={16} color="#2F6B57" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.menuWrap}>
          {menuList.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={styles.menuButton}
              onPress={() => moveTo(item.route)}
            >
              <Ionicons name={item.icon as any} size={20} color="#76A89A" />
              <Text style={styles.menuText}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Modal
        visible={petSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPetSheetVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPetSheetVisible(false)}
        >
          <Pressable style={styles.petSheet}>
            <Text style={styles.sheetTitle}>반려동물 선택</Text>

            <FlatList
              ref={listRef}
              data={pets}
              keyExtractor={(item) => item.id}
              style={styles.petList}
              showsVerticalScrollIndicator={false}
              getItemLayout={(_, index) => ({
                length: 52,
                offset: 52 * index,
                index,
              })}
              onScrollToIndexFailed={() => {}}
              ListEmptyComponent={
                <Text style={styles.emptyPetText}>
                  등록된 반려동물이 없어요
                </Text>
              }
              renderItem={({ item }) => {
                const isSelected = item.id === selectedPetId;

                return (
                  <TouchableOpacity
                    style={[
                      styles.petItem,
                      isSelected && styles.selectedPetItem,
                    ]}
                    onPress={() => handleSelectPet(item)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.petIconCircle}>
                      {renderPetIcon(item.petType, 20)}
                    </View>

                    <Text
                      style={[
                        styles.petItemText,
                        isSelected && styles.selectedPetText,
                      ]}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setPetSheetVisible(false);
                router.push({
                  pathname: "/profile",
                  params: {
                    from: "homeManage",
                  },
                } as any);
              }}
            >
              <Ionicons name="person" size={18} color="#111" />
              <Text style={styles.sheetRowText}>반려동물 프로필 관리</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setPetSheetVisible(false);
                router.push({
                  pathname: "/profile",
                  params: {
                    forceInput: "true",
                    entryMode: "add",
                    from: "homeAdd",
                  },
                } as any);
              }}
            >
              <Ionicons name="add" size={20} color="#777" />
              <Text style={styles.addPetText}>새 반려동물 추가</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setPetSheetVisible(false)}
            >
              <Text style={styles.closeButtonText}>닫기</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    backgroundColor: "#F6F7F4",
    justifyContent: "center", // ⭐ 핵심
  },
  settingButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  titleArea: {
    width: "100%",
    alignItems: "center",
    marginBottom: 60,
  },
  logo: {
    fontSize: 26,
    fontFamily: "KCC",
    color: "#2F6B57",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  petDropdown: {
    minWidth: 96,
    height: 38,
    borderRadius: 16,
    backgroundColor: "#EAF7EE",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
  },
  headerPetIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  petName: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  menuWrap: {
    width: "100%",
    gap: 16,
    marginTop: 20,
  },
  menuButton: {
    width: "100%",
    height: 64,
    borderWidth: 1.5,
    borderColor: "#BFD9CF",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  menuText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.22)",
    justifyContent: "center",
    alignItems: "center",
  },
  petSheet: {
    width: "82%",
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 12,
  },
  petList: {
    maxHeight: 170,
  },
  petItem: {
    height: 52,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 12,
  },
  selectedPetItem: {
    backgroundColor: "#E4F5E8",
  },
  petIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  petItemText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#111",
  },
  selectedPetText: {
    fontFamily: "NanumB",
    color: "#111",
  },
  emptyPetText: {
    textAlign: "center",
    color: "#777",
    fontSize: 14,
    fontFamily: "Nanum",
    paddingVertical: 20,
  },
  divider: {
    height: 1,
    backgroundColor: "#D6D6D6",
    marginTop: 10,
    marginBottom: 10,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
  },
  sheetRowText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#333",
  },
  addPetText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#777",
  },
  closeButton: {
    height: 44,
    backgroundColor: "#2F6B57",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "NanumB",
  },
});
