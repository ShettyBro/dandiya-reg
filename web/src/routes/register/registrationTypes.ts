export type RegistrationType = "ACHARYA_STUDENT" | "ACHARYA_FACULTY" | "NON_ACHARYAN_STUDENT";

export const ACHARYA_INSTITUTIONS = [
  "Acharya Institute of Technology",
  "Acharya Institute of Graduate Studies",
  "Acharya Polytechnic",
  "Acharya BM Reddy College of Pharmacy",
  "Smt Nagarathnamma College of Nursing",
  "Acharya NRV School of Architecture",
  "Acharya School of Design",
  "Acharya Institute of Allied Health Sciences",
  "Acharya NR Institute of Physiotherapy",
  "Acharya PU College"
] as const;

export const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
