import { flatMap } from 'lodash'

import { UserVisibleError } from '../../errors'
import { getFlagsForContext } from '../shared/flags'
import { formatHistogram } from '../shared/histogram'
import { fetchTranscriptsForConsequences } from '../shared/transcriptConsequence'
import { fetchGnomadMNVSummariesByVariantId } from './gnomadMultiNucleotideVariants'

const POPULATIONS = ['afr', 'amr', 'asj', 'eas', 'fin', 'nfe', 'oth', 'sas']

const SUBPOPULATIONS = {
  eas: ['jpn', 'kor', 'oea'],
  nfe: ['bgr', 'est', 'nwe', 'onf', 'seu', 'swe'],
}

const formatPopulations = variantData => [
  ...flatMap(POPULATIONS, popId => [
    {
      id: popId.toUpperCase(),
      ac: (variantData.AC_adj[popId] || {}).total || 0,
      an: (variantData.AN_adj[popId] || {}).total || 0,
      ac_hemi: variantData.nonpar ? (variantData.AC_adj[popId] || {}).male || 0 : 0,
      ac_hom: (variantData.nhomalt_adj[popId] || {}).total || 0,
    },
    ...(SUBPOPULATIONS[popId] || []).map(subPopId => ({
      id: `${popId.toUpperCase()}_${subPopId.toUpperCase()}`,
      ac: (variantData.AC_adj[popId] || {})[subPopId] || 0,
      an: (variantData.AN_adj[popId] || {})[subPopId] || 0,
      ac_hemi: null,
      ac_hom: (variantData.nhomalt_adj[popId] || {})[subPopId] || 0,
    })),
    {
      id: `${popId.toUpperCase()}_FEMALE`,
      ac: (variantData.AC_adj[popId] || {}).female || 0,
      an: (variantData.AN_adj[popId] || {}).female || 0,
      ac_hemi: 0,
      ac_hom: (variantData.nhomalt_adj[popId] || {}).female || 0,
    },
    {
      id: `${popId.toUpperCase()}_MALE`,
      ac: (variantData.AC_adj[popId] || {}).male || 0,
      an: (variantData.AN_adj[popId] || {}).male || 0,
      ac_hemi: variantData.nonpar ? (variantData.AC_adj[popId] || {}).male || 0 : 0,
      ac_hom: (variantData.nhomalt_adj[popId] || {}).male || 0,
    },
  ]),
  {
    id: 'FEMALE',
    ac: variantData.AC_adj.female || 0,
    an: variantData.AN_adj.female || 0,
    ac_hemi: 0,
    ac_hom: variantData.nhomalt_adj.female || 0,
  },
  {
    id: 'MALE',
    ac: variantData.AC_adj.male || 0,
    an: variantData.AN_adj.male || 0,
    ac_hemi: variantData.nonpar ? variantData.AC_adj.male || 0 : 0,
    ac_hom: variantData.nhomalt_adj.male || 0,
  },
]

const formatFilteringAlleleFrequency = (variantData, fafField) => {
  const fafData = variantData[fafField]
  const { total, ...populationFAFs } = variantData[fafField]

  let popmaxFAF = -Infinity
  let popmaxPopulation = null

  Object.keys(populationFAFs)
    // gnomAD 2.1.0 calculated FAF for singleton variants.
    // This filters out those invalid FAFs.
    .filter(popId => variantData.AC_adj[popId].total > 1)
    .forEach(popId => {
      if (populationFAFs[popId] > popmaxFAF) {
        popmaxFAF = fafData[popId]
        popmaxPopulation = popId.toUpperCase()
      }
    })

  if (popmaxFAF === -Infinity) {
    popmaxFAF = null
  }

  return {
    popmax: popmaxFAF,
    popmax_population: popmaxPopulation,
  }
}

const fetchLofCurationResults = async (ctx, variantId) => {
  const response = await ctx.database.elastic.search({
    index: 'lof_curation_results',
    type: 'documents',
    body: {
      query: {
        term: {
          variant_id: variantId,
        },
      },
    },
  })

  return response.hits.hits.map(doc => doc._source)
}

const fetchGnomadVariantData = async (ctx, variantId, subset) => {
  const requests = [
    { index: 'gnomad_exomes_2_1_1', subset },
    // All genome samples are non_cancer, so separate non-cancer numbers are not stored
    { index: 'gnomad_genomes_2_1_1', subset: subset === 'non_cancer' ? 'gnomad' : subset },
  ]

  const [exomeData, genomeData] = await Promise.all(
    requests.map(({ index, subset: requestSubset }) =>
      ctx.database.elastic
        .search({
          index,
          type: 'variant',
          _source: [
            requestSubset,
            'ab_hist_alt',
            'allele_info',
            'alt',
            'chrom',
            'dp_hist_all',
            'dp_hist_alt',
            'filters',
            'flags',
            'gnomad_age_hist_het',
            'gnomad_age_hist_hom',
            'gq_hist_all',
            'gq_hist_alt',
            'nonpar',
            'pab_max',
            'pos',
            'qual',
            'ref',
            'rf_tp_probability',
            'rsid',
            'sortedTranscriptConsequences',
            'variant_id',
          ],
          body: {
            query: {
              bool: {
                filter: [
                  { term: { variant_id: variantId } },
                  { range: { [`${requestSubset}.AC_raw`]: { gt: 0 } } },
                ],
              },
            },
          },
          size: 1,
        })
        .then(response => response.hits.hits[0])
        // eslint-disable-next-line no-underscore-dangle
        .then(doc => (doc ? { ...doc._source, ...doc._source[requestSubset] } : undefined))
    )
  )

  return {
    exomeData,
    genomeData,
  }
}

const fetchColocatedVariants = async (ctx, variantId, subset) => {
  const parts = variantId.split('-')
  const chrom = parts[0]
  const pos = Number(parts[1])

  const requests = [
    { index: 'gnomad_exomes_2_1_1', subset },
    // All genome samples are non_cancer, so separate non-cancer numbers are not stored
    { index: 'gnomad_genomes_2_1_1', subset: subset === 'non_cancer' ? 'gnomad' : subset },
  ]

  const [exomeResponse, genomeResponse] = await Promise.all(
    requests.map(({ index, subset: requestSubset }) =>
      ctx.database.elastic.search({
        index,
        type: 'variant',
        _source: ['variant_id'],
        body: {
          query: {
            bool: {
              filter: [
                { term: { chrom } },
                { term: { pos } },
                { range: { [`${requestSubset}.AC_raw`]: { gt: 0 } } },
              ],
            },
          },
        },
      })
    )
  )

  /* eslint-disable no-underscore-dangle */
  const exomeVariants = exomeResponse.hits.hits.map(doc => doc._source.variant_id)
  const genomeVariants = genomeResponse.hits.hits.map(doc => doc._source.variant_id)
  /* eslint-enable no-underscore-dangle */

  const combinedVariants = exomeVariants.concat(genomeVariants)

  return combinedVariants
    .filter(otherVariantId => otherVariantId !== variantId)
    .sort()
    .filter(
      (otherVariantId, index, allOtherVariantIds) =>
        otherVariantId !== allOtherVariantIds[index + 1]
    )
}

const fetchGnomadVariantDetails = async (ctx, variantId, subset) => {
  const { exomeData, genomeData } = await fetchGnomadVariantData(ctx, variantId, subset)

  if (!exomeData && !genomeData) {
    throw new UserVisibleError('Variant not found')
  }

  const sharedData = exomeData || genomeData
  let transcriptConsequences = sharedData.sortedTranscriptConsequences || []

  const [
    colocatedVariants,
    multiNucleotideVariants,
    transcripts,
    lofCurationResults,
  ] = await Promise.all([
    fetchColocatedVariants(ctx, variantId, subset),
    fetchGnomadMNVSummariesByVariantId(ctx, variantId),
    fetchTranscriptsForConsequences(ctx, transcriptConsequences, 'GRCh37'),
    fetchLofCurationResults(ctx, variantId),
  ])

  transcriptConsequences = transcriptConsequences.map(consequence => ({
    ...consequence,
    gene_version: transcripts[consequence.transcript_id].gene.gene_version,
    transcript_version: transcripts[consequence.transcript_id].transcript_version,
  }))

  const geneSymbols = transcriptConsequences.reduce(
    (acc, csq) => ({
      ...acc,
      [csq.gene_id]: csq.gene_symbol,
    }),
    {}
  )

  return {
    // variant ID fields
    variantId: sharedData.variant_id,
    reference_genome: 'GRCh37',
    chrom: sharedData.chrom,
    pos: sharedData.pos,
    ref: sharedData.ref,
    alt: sharedData.alt,
    // gnomAD specific fields
    colocatedVariants,
    multiNucleotideVariants,
    exome: exomeData
      ? {
          ac: exomeData.AC_adj.total,
          an: exomeData.AN_adj.total,
          ac_hemi: exomeData.nonpar ? exomeData.AC_adj.male : 0,
          ac_hom: exomeData.nhomalt_adj.total,
          faf95: formatFilteringAlleleFrequency(exomeData, 'faf95_adj'),
          faf99: formatFilteringAlleleFrequency(exomeData, 'faf99_adj'),
          filters: exomeData.filters,
          populations: formatPopulations(exomeData),
          age_distribution: {
            het: formatHistogram(exomeData.gnomad_age_hist_het),
            hom: formatHistogram(exomeData.gnomad_age_hist_hom),
          },
          qualityMetrics: {
            alleleBalance: {
              alt: formatHistogram(exomeData.ab_hist_alt),
            },
            genotypeDepth: {
              all: formatHistogram(exomeData.dp_hist_all),
              alt: formatHistogram(exomeData.dp_hist_alt),
            },
            genotypeQuality: {
              all: formatHistogram(exomeData.gq_hist_all),
              alt: formatHistogram(exomeData.gq_hist_alt),
            },
            siteQualityMetrics: [
              { metric: 'BaseQRankSum', value: exomeData.allele_info.BaseQRankSum },
              { metric: 'ClippingRankSum', value: exomeData.allele_info.ClippingRankSum },
              { metric: 'DP', value: exomeData.allele_info.DP },
              { metric: 'FS', value: exomeData.allele_info.FS },
              { metric: 'InbreedingCoeff', value: exomeData.allele_info.InbreedingCoeff },
              { metric: 'MQ', value: exomeData.allele_info.MQ },
              { metric: 'MQRankSum', value: exomeData.allele_info.MQRankSum },
              { metric: 'pab_max', value: exomeData.pab_max },
              { metric: 'QD', value: exomeData.allele_info.QD },
              { metric: 'ReadPosRankSum', value: exomeData.allele_info.ReadPosRankSum },
              { metric: 'RF', value: exomeData.rf_tp_probability },
              { metric: 'SiteQuality', value: exomeData.qual },
              { metric: 'SOR', value: exomeData.allele_info.SOR },
              { metric: 'VQSLOD', value: exomeData.allele_info.VQSLOD },
            ],
          },
        }
      : null,
    flags: getFlagsForContext({ type: 'region' })(sharedData),
    genome: genomeData
      ? {
          ac: genomeData.AC_adj.total,
          an: genomeData.AN_adj.total,
          ac_hemi: genomeData.nonpar ? genomeData.AC_adj.male : 0,
          ac_hom: genomeData.nhomalt_adj.total,
          faf95: formatFilteringAlleleFrequency(genomeData, 'faf95_adj'),
          faf99: formatFilteringAlleleFrequency(genomeData, 'faf99_adj'),
          filters: genomeData.filters,
          populations: formatPopulations(genomeData),
          age_distribution: {
            het: formatHistogram(genomeData.gnomad_age_hist_het),
            hom: formatHistogram(genomeData.gnomad_age_hist_hom),
          },
          qualityMetrics: {
            alleleBalance: {
              alt: formatHistogram(genomeData.ab_hist_alt),
            },
            genotypeDepth: {
              all: formatHistogram(genomeData.dp_hist_all),
              alt: formatHistogram(genomeData.dp_hist_alt),
            },
            genotypeQuality: {
              all: formatHistogram(genomeData.gq_hist_all),
              alt: formatHistogram(genomeData.gq_hist_alt),
            },
            siteQualityMetrics: [
              { metric: 'BaseQRankSum', value: genomeData.allele_info.BaseQRankSum },
              { metric: 'ClippingRankSum', value: genomeData.allele_info.ClippingRankSum },
              { metric: 'DP', value: genomeData.allele_info.DP },
              { metric: 'FS', value: genomeData.allele_info.FS },
              { metric: 'InbreedingCoeff', value: genomeData.allele_info.InbreedingCoeff },
              { metric: 'MQ', value: genomeData.allele_info.MQ },
              { metric: 'MQRankSum', value: genomeData.allele_info.MQRankSum },
              { metric: 'pab_max', value: genomeData.pab_max },
              { metric: 'QD', value: genomeData.allele_info.QD },
              { metric: 'ReadPosRankSum', value: genomeData.allele_info.ReadPosRankSum },
              { metric: 'RF', value: genomeData.rf_tp_probability },
              { metric: 'SiteQuality', value: genomeData.qual },
              { metric: 'SOR', value: genomeData.allele_info.SOR },
              { metric: 'VQSLOD', value: genomeData.allele_info.VQSLOD },
            ],
          },
        }
      : null,
    lof_curations: lofCurationResults.map(result => ({
      ...result,
      gene_symbol: geneSymbols[result.gene_id],
    })),
    rsid: sharedData.rsid,
    sortedTranscriptConsequences: transcriptConsequences,
  }
}

export default fetchGnomadVariantDetails
