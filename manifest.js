module.exports = {
  id: "com.arabseed.stremio",
  version: "1.0.0",
  name: "ArabSeed",
  description: "احصل على افلام ومسلسلات عربية من ArabSeed",
  logo: "https://a.asd.homes/wp-content/uploads/2023/01/logo.png",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  idPrefixes: ["asd"],
  catalogs: [
    {
      type: "movie",
      id: "arabseed-arabic-movies",
      name: "افلام عربي",
      extra: [
        { name: "skip", isRequired: false },
        { name: "search", isRequired: false },
      ],
    },
        {
      type: "movie",
      id: "arabseed-english-movies",
      name: "افلام أجنبي",
      extra: [
        { name: "skip", isRequired: false },
        { name: "search", isRequired: false },
      ],
    },
    {
      type: "series",
      id: "arabseed-arabic-series",
      name: "مسلسلات عربي",
      extra: [
        { name: "skip", isRequired: false },
        { name: "search", isRequired: false },
      ],
    },
    {
      type: "series",
      id: "arabseed-turkish-series",
      name: "مسلسلات تركي",
      extra: [
        { name: "skip", isRequired: false },
        { name: "search", isRequired: false },
      ],
    },
        {
      type: "series",
      id: "arabseed-english-series",
      name: "مسلسلات اجنبي",
      extra: [
        { name: "skip", isRequired: false },
        { name: "search", isRequired: false },
      ],
    },
  ],
};
