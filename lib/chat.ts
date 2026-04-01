// Avatar colors palette — deterministic from user_id
const AVATAR_COLORS = [
  { bg: "#E1F5EE", text: "#085041" },
  { bg: "#EEEDFE", text: "#3C3489" },
  { bg: "#FAEEDA", text: "#633806" },
  { bg: "#FAECE7", text: "#712B13" },
  { bg: "#E8F0FE", text: "#1A4D8F" },
  { bg: "#FDE8F0", text: "#8B1A4A" },
  { bg: "#F0F4E8", text: "#3D5A1E" },
  { bg: "#FFF3E0", text: "#BF5E00" },
];

export function getAvatarColor(userId: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";

  const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

// RDV card message format: JSON embedded in content
export interface RdvData {
  type: "rdv";
  location: string;
  datetime: string;
}

export function isRdvMessage(content: string): RdvData | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === "rdv") return parsed as RdvData;
  } catch {
    // not JSON, normal message
  }
  return null;
}

export function createRdvContent(location: string, datetime: string): string {
  return JSON.stringify({ type: "rdv", location, datetime } satisfies RdvData);
}
