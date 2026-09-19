const GROUPS = Object.freeze({
  "North America": ["Canada", "United States"],
  "Latin America and the Caribbean": [
    "Argentina", "Barbados", "Belize", "Bolivia", "Brazil", "Chile", "Colombia",
    "Costa Rica", "Cuba", "Dominican Republic", "Ecuador", "El Salvador", "Guatemala",
    "Guyana", "Haiti", "Honduras", "Jamaica", "Mexico", "Nicaragua", "Panama",
    "Paraguay", "Peru", "Puerto Rico", "Suriname", "Trinidad and Tobago", "Uruguay",
    "Venezuela",
  ],
  Europe: [
    "Albania", "Austria", "Belarus", "Belgium", "Bosnia and Herzegovina", "Bulgaria",
    "Bosnia", "Croatia", "Cyprus", "Czech Republic", "Czechia", "Denmark", "Estonia", "Finland",
    "France", "Georgia", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy",
    "Kosovo", "Latvia", "Lithuania", "Luxembourg", "Malta", "Moldova", "Monaco",
    "Montenegro", "Netherlands", "North Macedonia", "Norway", "Poland", "Portugal",
    "Romania", "Russia", "San Marino", "Serbia", "Slovakia", "Slovenia", "Spain",
    "Sweden", "Switzerland", "Ukraine", "United Kingdom",
  ],
  Africa: [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon",
    "Cape Verde", "Chad", "Congo", "Democratic Republic of the Congo", "Egypt", "Eritrea",
    "Eswatini", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Ivory Coast", "Kenya",
    "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali", "Mauritania",
    "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda",
    "Senegal", "Sierra Leone", "Somalia", "South Africa", "Sudan", "Tanzania", "Togo",
    "Tunisia", "Uganda", "Zaire", "Zambia", "Zimbabwe",
  ],
  "East Asia": ["China", "Hong Kong", "Japan", "Macau", "Mongolia", "North Korea", "South Korea", "Taiwan"],
  "South Asia": ["Afghanistan", "Bangladesh", "Bhutan", "India", "Maldives", "Nepal", "Pakistan", "Sri Lanka"],
  "Southeast Asia": ["Brunei", "Burma", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar", "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam"],
  "Middle East": ["Armenia", "Azerbaijan", "Bahrain", "Iran", "Iraq", "Israel", "Jordan", "Kuwait", "Lebanon", "Oman", "Palestine", "Qatar", "Saudi Arabia", "Syria", "Turkey", "United Arab Emirates", "Yemen"],
  "Central Asia": ["Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan", "Uzbekistan"],
  Oceania: ["Australia", "Fiji", "New Zealand", "Papua New Guinea", "Samoa", "Tonga"],
});

const LOOKUP = new Map(Object.entries(GROUPS).flatMap(([region, countries]) =>
  countries.map((country) => [country.toLowerCase(), region])));

export function coverageRegionForCountry(country) {
  return LOOKUP.get(String(country || "").trim().toLowerCase()) || "Other / cross-regional";
}

export const COVERAGE_REGIONS = Object.freeze(Object.keys(GROUPS));
