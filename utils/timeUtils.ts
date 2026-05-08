export function to24Hour(period: "오전" | "오후", hour: string) {
  let h = Number(hour);

  if (period === "오전") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }

  return h;
}
