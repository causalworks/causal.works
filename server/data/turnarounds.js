const TURNAROUND_ALIASES = {
  "climate": "Energy", "environment": "Energy", "emissions": "Energy",
  "fossil fuels": "Energy", "renewable": "Energy", "carbon": "Energy",
  "agriculture": "Food", "farming": "Food", "food systems": "Food",
  "economic justice": "Inequality", "wealth": "Inequality", "tax": "Inequality", "housing": "Inequality",
  "development": "Poverty", "global south": "Poverty", "debt": "Poverty",
  "gender": "Empowerment", "women": "Empowerment", "gender equality": "Empowerment", "reproductive": "Empowerment",
};

const VALID_PARAMETERS = new Set([
  "Renewable grid share", "Fossil fuel phase-out speed", "Carbon capture scale",
  "Energy efficiency rate", "Direct air capture",
  "Meat reduction rate", "Regenerative farming share", "Food waste reduction",
  "Worker income share", "Wealth tax rate", "Tax progressivity", "Commons income",
  "Global debt relief", "Green tech transfer", "Private development finance", "Public development finance",
  "Gender equity funding", "Women's pension equity", "Reproductive health access"
]);

module.exports = { TURNAROUND_ALIASES, VALID_PARAMETERS };
