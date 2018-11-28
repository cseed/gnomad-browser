const sampleCounts = {
  gnomad_r2_1: {
    exomes: {
      afr: 8128,
      amr: 17296,
      asj: 5040,
      eas: 9197,
      fin: 10824,
      nfe: 56885,
      sas: 15308,
      oth: 3070,
    },
    genomes: { afr: 4359, amr: 424, asj: 145, eas: 780, fin: 1738, nfe: 7718, sas: '*', oth: 544 },
    exomesTotal: 125748,
    genomesTotal: 15708,
    total: 141456,
  },
  gnomad_r2_1_controls: {
    exomes: {
      afr: 3582,
      amr: 8556,
      asj: 1160,
      eas: 4523,
      fin: 6697,
      nfe: 21384,
      sas: 7845,
      oth: 957,
    },
    genomes: { afr: 1287, amr: 123, asj: 19, eas: 458, fin: 581, nfe: 2762, sas: '*', oth: 212 },
    exomesTotal: 54704,
    genomesTotal: 5442,
    total: 60146,
  },
  gnomad_r2_1_non_cancer: {
    exomes: {
      afr: 7451,
      amr: 17130,
      asj: 4786,
      eas: 8846,
      fin: 10816,
      nfe: 51377,
      sas: 15263,
      oth: 2810,
    },
    genomes: { afr: 4359, amr: 424, asj: 145, eas: 780, fin: 1738, nfe: 7718, sas: '*', oth: 544 },
    exomesTotal: 118479,
    genomesTotal: 15708,
    total: 134187,
  },
  gnomad_r2_1_non_neuro: {
    exomes: {
      afr: 8109,
      amr: 15262,
      asj: 3106,
      eas: 6708,
      fin: 8367,
      nfe: 44779,
      oth: 2433,
      sas: 15304,
    },
    genomes: { afr: 1694, amr: 277, asj: 123, eas: 780, fin: 582, nfe: 6813, sas: '*', oth: 367 },
    exomesTotal: 104068,
    genomesTotal: 10636,
    total: 114704,
  },
  gnomad_r2_1_non_topmed: {
    exomes: {
      afr: 6013,
      amr: 17229,
      asj: 4999,
      eas: 9195,
      fin: 10823,
      nfe: 55840,
      sas: 15308,
      oth: 3032,
    },
    genomes: { afr: 4278, amr: 405, asj: 69, eas: 761, fin: 1738, nfe: 5547, sas: '*', oth: 506 },
    exomesTotal: 122439,
    genomesTotal: 13304,
    total: 135743,
  },
  exac: {
    total: 60706,
  },
}

export default sampleCounts
