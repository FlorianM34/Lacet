export type BadgeFamily = "distance" | "hikes" | "organizer";

export interface BadgeDefinition {
  id: string;
  label: string;
  family: BadgeFamily;
  threshold: number;
  unit: string;
}

export const BADGES: BadgeDefinition[] = [
  { id: "distance_bronze", label: "Randonneur",     family: "distance",  threshold: 50,  unit: "km" },
  { id: "distance_silver", label: "Explorateur",    family: "distance",  threshold: 200, unit: "km" },
  { id: "distance_gold",   label: "Baroudeur",      family: "distance",  threshold: 500, unit: "km" },
  { id: "hikes_bronze",    label: "Première sortie", family: "hikes",    threshold: 1,   unit: "randos" },
  { id: "hikes_silver",    label: "Habitué",        family: "hikes",     threshold: 10,  unit: "randos" },
  { id: "hikes_gold",      label: "Vétéran",        family: "hikes",     threshold: 30,  unit: "randos" },
  { id: "orga_bronze",     label: "Initiateur",     family: "organizer", threshold: 1,   unit: "randos organisées" },
  { id: "orga_silver",     label: "Guide",          family: "organizer", threshold: 5,   unit: "randos organisées" },
  { id: "orga_gold",       label: "Chef de cordée", family: "organizer", threshold: 15,  unit: "randos organisées" },
];
