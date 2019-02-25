import { transparentize } from 'polished'
import PropTypes from 'prop-types'
import React from 'react'
import styled from 'styled-components'

import { QuestionMark } from '@broad/help'
import { Track } from '@broad/region-viewer'
import { TooltipAnchor } from '@broad/ui'

const Wrapper = styled.div`
  display: flex;
  margin-bottom: 1em;
`

const PlotWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
`

const RegionAttributeList = styled.dl`
  margin: 0;

  div {
    margin-bottom: 0.25em;
  }

  dt {
    display: inline;
    font-weight: bold;
  }

  dd {
    display: inline;
    margin-left: 0.5em;
  }
`

function regionColor(region) {
  // http://colorbrewer2.org/#type=sequential&scheme=YlOrRd&n=3
  let color
  if (region.obs_exp > 0.6) {
    color = '#e2e2e2'
  } else if (region.obs_exp > 0.4) {
    color = '#ffeda0'
  } else if (region.obs_exp > 0.2) {
    color = '#feb24c'
  } else {
    color = '#f03b20'
  }

  return region.chisq_diff_null < 10.8 ? transparentize(0.8, color) : color
}

const renderNumber = number =>
  number === undefined || number === null ? '-' : number.toPrecision(4)

const RegionTooltip = ({ region }) => (
  <RegionAttributeList>
    <div>
      <dt>O/E missense:</dt>
      <dd>{renderNumber(region.obs_exp)}</dd>
    </div>
    <div>
      <dt>
        &chi;
        <sup>2</sup>:
      </dt>
      <dd>
        {renderNumber(region.chisq_diff_null)}
        {region.chisq_diff_null !== null && region.chisq_diff_null < 10.8 && ' (not significant)'}
      </dd>
    </div>
  </RegionAttributeList>
)

RegionTooltip.propTypes = {
  region: PropTypes.shape({
    obs_exp: PropTypes.number,
    chisq_diff_null: PropTypes.number,
  }).isRequired,
}

const RegionalConstraintTrack = ({ height, regions }) => (
  <Wrapper>
    <Track
      renderLeftPanel={() => (
        <span>
          Regional missense constraint
          <QuestionMark topic="regional-constraint" display="inline" />
        </span>
      )}
    >
      {({ scalePosition, width }) => (
        <PlotWrapper>
          <svg height={height} width={width}>
            {regions.map(region => {
              const start = Math.min(region.genomic_start, region.genomic_end)
              const stop = Math.max(region.genomic_start, region.genomic_end)

              const startX = scalePosition(start)
              const stopX = scalePosition(stop)
              const regionWidth = stopX - startX

              return (
                <TooltipAnchor
                  key={region.region_name}
                  region={region}
                  tooltipComponent={RegionTooltip}
                >
                  <g>
                    <rect
                      x={startX}
                      y={0}
                      width={regionWidth}
                      height={height}
                      fill={regionColor(region)}
                      stroke="black"
                    />
                    {regionWidth > 30 && (
                      <text x={(startX + stopX) / 2} y={height / 2} dy="0.33em" textAnchor="middle">
                        {region.obs_exp.toFixed(2)}
                      </text>
                    )}
                  </g>
                </TooltipAnchor>
              )
            })}
          </svg>
        </PlotWrapper>
      )}
    </Track>
  </Wrapper>
)

RegionalConstraintTrack.propTypes = {
  height: PropTypes.number,
  regions: PropTypes.arrayOf(
    PropTypes.shape({
      genomic_end: PropTypes.number.isRequired,
      genomic_start: PropTypes.number.isRequired,
      region_name: PropTypes.string.isRequired,
    })
  ).isRequired,
}

RegionalConstraintTrack.defaultProps = {
  height: 15,
}

export default RegionalConstraintTrack