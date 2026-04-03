import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ProfileData = {
  name?: string;
  age?: string;
  weight?: string;
  gender?: string;
  petType?: string;
  bcs?: string;
  diseases?: string[];
};

type LoggedInUser = {
  id: string;
  email: string;
  password: string;
};

export default function ProfileCompleteScreen() {
  const [profiles, setProfiles] = useState<ProfileData[]>([]);

  const loadProfiles = useCallback(async () => {
    try {
      const savedUser = await AsyncStorage.getItem("loggedInUser");
      const parsedUser: LoggedInUser | null = savedUser
        ? JSON.parse(savedUser)
        : null;

      if (!parsedUser?.email) {
        return;
      }

      const email = parsedUser.email;
      const profilesKey = `petProfiles_${email}`;
      const savedProfiles = await AsyncStorage.getItem(profilesKey);

      const parsedProfiles: ProfileData[] = savedProfiles
        ? JSON.parse(savedProfiles)
        : [];

      setProfiles(parsedProfiles);
    } catch (error) {
      console.log(error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles]),
  );

  const handleAddProfile = async () => {
    try {
      const savedUser = await AsyncStorage.getItem("loggedInUser");
      const parsedUser: LoggedInUser | null = savedUser
        ? JSON.parse(savedUser)
        : null;

      if (!parsedUser?.email) {
        router.replace("/" as any);
        return;
      }

      const email = parsedUser.email;

      await AsyncStorage.removeItem(`petProfile_${email}`);
      await AsyncStorage.removeItem(`petProfileDraft_${email}`);
      await AsyncStorage.removeItem(`profileCompleted_${email}`);

      router.push({
        pathname: "/profile",
        params: {
          forceInput: "true",
        },
      } as any);
    } catch (error) {
      console.log(error);
    }
  };

  const handleDone = () => {
    router.replace("/home" as any);
  };

  const renderProfileIcon = (petType?: string) => {
    if (petType === "고양이") {
      return <Ionicons name="logo-octocat" size={30} color="#111111" />;
    }

    return <Ionicons name="paw" size={30} color="#111111" />;
  };

  const getProfileSummary = (profile: ProfileData) => {
    const weightText = profile.weight ? `${profile.weight}kg` : "-";
    const diseaseText =
      profile.diseases && profile.diseases.length > 0
        ? profile.diseases.join(", ")
        : "없음";

    return `${profile.age || "-"} / ${weightText} / ${profile.gender || "-"} / ${profile.bcs || "-"} / ${diseaseText}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>프로필</Text>

        {profiles.map((profile, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.avatar}>
              {renderProfileIcon(profile.petType)}
            </View>

            <View style={styles.infoWrap}>
              <Text style={styles.name}>{profile.name || "이름"}</Text>
              <Text style={styles.subInfo}>{getProfileSummary(profile)}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={handleAddProfile}>
          <Text style={styles.addButtonText}>⊕ 프로필 추가하기</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>완료</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 24,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF3EF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: "#2F6B57",
    backgroundColor: "#FFFFFF",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  infoWrap: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontFamily: "NanumB",
    color: "#111111",
    marginBottom: 4,
  },
  subInfo: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#666666",
    lineHeight: 18,
  },
  addButton: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#2F6B57",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  doneButton: {
    marginTop: "auto",
    height: 50,
    borderRadius: 12,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
  },
  doneButtonText: {
    fontSize: 20,
    fontFamily: "NanumB",
    color: "#FFFFFF",
  },
});
