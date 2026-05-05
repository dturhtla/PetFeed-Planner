import React, { useRef } from "react";
import {
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export const TIME_WHEEL_ITEM_HEIGHT = 34;

export type EditableTimeWheelProps = {
  value: string;
  loopedOptions: string[];
  scrollRef: React.RefObject<ScrollView | null>;
  isEditing: boolean;
  inputValue: string;
  onInputChange: (text: string) => void;
  onSaveInput: () => void;
  onWheelEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onDoubleTap: () => void;
};

export default function EditableTimeWheel({
  value,
  loopedOptions,
  scrollRef,
  isEditing,
  inputValue,
  onInputChange,
  onSaveInput,
  onWheelEnd,
  onDoubleTap,
}: EditableTimeWheelProps) {
  const lastTapRef = useRef(0);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onDoubleTap();
    }
    lastTapRef.current = now;
  };

  if (isEditing) {
    return (
      <View style={styles.manualTimeInputWrap}>
        <TextInput
          style={styles.manualTimeInput}
          value={inputValue}
          onChangeText={onInputChange}
          keyboardType="numeric"
          maxLength={2}
          autoFocus
          onBlur={onSaveInput}
          onSubmitEditing={onSaveInput}
        />
      </View>
    );
  }

  return (
    <View style={styles.timeWheelContainer}>
      <ScrollView
        ref={scrollRef}
        style={styles.timeWheel}
        contentContainerStyle={styles.wheelScrollContent}
        showsVerticalScrollIndicator={false}
        snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        bounces={false}
        nestedScrollEnabled
        onMomentumScrollEnd={onWheelEnd}
      >
        {loopedOptions.map((item, index) => (
          <TouchableOpacity
            key={`${item}-${index}`}
            activeOpacity={1}
            onPress={handleTap}
            style={styles.wheelItem}
          >
            <Text
              style={[
                styles.wheelText,
                item === value && styles.wheelTextSelected,
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheelScrollContent: {
    paddingVertical: TIME_WHEEL_ITEM_HEIGHT,
  },
  timeWheelContainer: {
    width: 72,
    height: TIME_WHEEL_ITEM_HEIGHT * 3,
    position: "relative",
  },
  timeWheel: {
    width: 72,
    height: TIME_WHEEL_ITEM_HEIGHT * 3,
  },
  wheelItem: {
    height: TIME_WHEEL_ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  wheelText: {
    fontSize: 17,
    fontFamily: "Nanum",
    color: "#C4C4C4",
  },
  wheelTextSelected: {
    color: "#2F2F2F",
    fontFamily: "NanumB",
  },
  manualTimeInputWrap: {
    width: 72,
    height: TIME_WHEEL_ITEM_HEIGHT * 3,
    justifyContent: "center",
    alignItems: "center",
  },
  manualTimeInput: {
    width: 56,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2F6B57",
    textAlign: "center",
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F2F2F",
    paddingVertical: 0,
  },
});
