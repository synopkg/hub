import { isUndefined, orderBy } from 'lodash';
import moment from 'moment';
import { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import semver from 'semver';

import API from '../../api';
import { PackageViewsStats } from '../../types';
import sumObjectValues from '../../utils/sumObjectValues';
import styles from './PackageViewsStats.module.css';

interface Props {
  packageId: string;
  version?: string;
}

interface Series {
  name: string;
  data: any[];
}

interface ViewsPerVersion {
  version: string;
  total: number;
}

interface ViewsPerDate {
  date: string;
  total: number;
}

const MAX_VISIBLE_VERSIONS = 3;

const sortPkgVersions = (availableVersions: string[]): string[] => {
  if (availableVersions) {
    const validVersions: string[] = availableVersions.filter((version: string) => semver.valid(version));
    const invalidVersions: string[] = availableVersions.filter((version: string) => !semver.valid(version));
    try {
      const sortedValidVersions = validVersions.sort((a, b) => (semver.lt(a, b) ? 1 : -1));
      return [...sortedValidVersions, ...invalidVersions];
    } catch {
      return availableVersions;
    }
  }
  return [];
};

const getMostPopularVersions = (stats: PackageViewsStats): string[] => {
  const totalViewsPerVersion: ViewsPerVersion[] = [];
  Object.keys(stats).forEach((version: string) => {
    const totalViews = sumObjectValues(stats[version]);
    if (totalViews > 0) {
      totalViewsPerVersion.push({
        version: version,
        total: totalViews,
      });
    }
  });

  const versions = orderBy(totalViewsPerVersion, 'total', 'desc')
    .slice(0, MAX_VISIBLE_VERSIONS)
    .map((vpv: ViewsPerVersion) => vpv.version);

  return sortPkgVersions(versions);
};

const prepareChartsSeries = (stats: PackageViewsStats, version?: string): Series[] => {
  let series: Series[] = [];
  let visibleVersions: string[] = [];
  if (version) {
    if (!isUndefined(stats[version])) {
      visibleVersions = [version];
    } else {
      return [];
    }
  } else {
    visibleVersions = getMostPopularVersions(stats);
  }

  const last30Days = Array.from(Array(30).keys()).map((x: number) => moment().subtract(x, 'days').format('YYYY-MM-DD'));

  visibleVersions.forEach((version: string) => {
    const data = last30Days.map((date: string) => {
      return [moment(date).unix() * 1000, stats[version][date] || 0];
    });

    series.push({
      name: version,
      data: data,
    });
  });

  const statsVersions = Object.keys(stats);

  if (statsVersions.length > visibleVersions.length && isUndefined(version)) {
    const restVersions = statsVersions.filter((version: string) => !visibleVersions.includes(version));
    const restVersionsPerDates: ViewsPerDate[] = last30Days.map((date: string) => {
      let views = 0;
      restVersions.forEach((version: string) => {
        views = views + (stats[version][date] | 0);
      });
      return { date: date, total: views };
    });

    const data = restVersionsPerDates.map((vpd: ViewsPerDate) => {
      return [moment(vpd.date).unix() * 1000, vpd.total];
    });

    series.push({
      name: 'Other',
      data: data,
    });
  }

  return series;
};

const PackagesViewsStats = (props: Props) => {
  const [series, setSeries] = useState<any[]>([]);
  const [stats, setStats] = useState<PackageViewsStats | undefined>();

  const getStackedChartConfig = (): ApexCharts.ApexOptions => {
    return {
      chart: {
        id: 'pkg-views',
        type: 'bar',
        stacked: true,
        redrawOnWindowResize: true,
        redrawOnParentResize: false,
        zoom: {
          enabled: false,
        },
        fontFamily: "'Lato', Roboto, 'Helvetica Neue', Arial, sans-serif !default",
        toolbar: {
          show: false,
        },
      },
      grid: { borderColor: 'var(--border-md)' },
      dataLabels: {
        enabled: false,
      },
      tooltip: {
        // shared: true,
        // intersect: false,
        followCursor: false,
        onDatasetHover: {
          highlightDataSeries: false,
        },
        x: {
          format: 'dd MMM yy',
        },
        y: {
          formatter: function (value) {
            return value.toFixed(0);
          },
        },
      },
      states: {
        hover: {
          filter: {
            type: 'lighten',
            value: 0,
          },
        },
        active: {
          filter: {
            type: 'darken',
            value: 0,
          },
        },
      },
      legend: {
        showForSingleSeries: true,
        position: 'bottom',
        horizontalAlign: 'center',
        itemMargin: {
          horizontal: 10,
        },
        offsetY: 20,
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: {
            colors: 'var(--color-font)',
            fontSize: '11px',
          },
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: 'var(--color-font)',
            fontSize: '11px',
          },
        },
      },
      colors: ['#33a1fd', '#06d6a0', '#ffc43d', '#bfc0c0'],
    };
  };

  useEffect(() => {
    async function getStats() {
      try {
        const data = await API.getViews(props.packageId);
        setStats(data);
      } catch (err: any) {
        // Don't display any error if API request fails
      }
    }
    getStats();
  }, [props.packageId]); /* eslint-disable-line react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!isUndefined(stats)) {
      setSeries(prepareChartsSeries(stats, props.version));
    }
  }, [props.version, stats]); /* eslint-disable-line react-hooks/exhaustive-deps */

  if (series.length === 0) return null;

  return (
    <div className="mb-5">
      <h3 className="position-relative mb-4">Views over the last 30 days</h3>
      <div className={`card ${styles.chartWrapper}`}>
        <ReactApexChart options={getStackedChartConfig()} series={series} type="bar" height="300" />
      </div>
    </div>
  );
};

export default PackagesViewsStats;