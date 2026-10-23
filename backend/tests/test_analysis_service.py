from datetime import date, time

from app.services import analysis_service


def test_cutoff_comparison_fetches_source_snapshot_once_and_reselects_per_cutoff(monkeypatch):
    analysis_service.clear_cache()
    counts = {'actuals': 0, 'forecasts': 0}
    monkeypatch.setattr(analysis_service, 'fetch_day_actuals', lambda day: counts.__setitem__('actuals', counts['actuals'] + 1) or [
        {'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-15T09:00:00Z', 'fuelType': 'WIND', 'generation': 450}
    ])
    monkeypatch.setattr(analysis_service, 'fetch_day_forecasts', lambda day: counts.__setitem__('forecasts', counts['forecasts'] + 1) or [
        {'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-13T11:00:00Z', 'generation': 500},
        {'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-13T15:00:00Z', 'generation': 600},
        {'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-13T17:00:00Z', 'generation': 999},
    ])

    result = analysis_service.get_cutoff_comparison(date(2026, 1, 14), [time(12, 0), time(16, 0)], refresh=True)
    assert counts == {'actuals': 1, 'forecasts': 1}
    early, late = result['cutoffs']
    assert early['metrics']['mae'] == 50
    assert late['metrics']['mae'] == 150
    assert early['valid_matched_intervals'] == 1
    assert late['valid_matched_intervals'] == 1
    assert result['provenance']['cache_bypassed'] is True
    analysis_service.clear_cache()


def test_raw_cache_is_shared_across_cutoffs_but_separated_by_date_and_refresh(monkeypatch):
    analysis_service.clear_cache()
    counts = {'actuals': 0, 'forecasts': 0}
    def actuals(day):
        counts['actuals'] += 1
        return []
    def forecasts(day):
        counts['forecasts'] += 1
        return []
    monkeypatch.setattr(analysis_service, 'fetch_day_actuals', actuals)
    monkeypatch.setattr(analysis_service, 'fetch_day_forecasts', forecasts)

    analysis_service.get_analysis(date(2026, 1, 14), time(12, 0))
    analysis_service.get_analysis(date(2026, 1, 14), time(16, 0))
    assert counts == {'actuals': 1, 'forecasts': 1}
    analysis_service.get_analysis(date(2026, 1, 15), time(16, 0))
    assert counts == {'actuals': 2, 'forecasts': 2}
    analysis_service.get_analysis(date(2026, 1, 15), time(16, 0), refresh=True)
    assert counts == {'actuals': 3, 'forecasts': 3}
    analysis_service.clear_cache()


def test_successful_refresh_invalidates_stale_nonrefresh_analysis(monkeypatch):
    analysis_service.clear_cache()
    generation = {'value': 500}
    fetch_counts = {'actuals': 0, 'forecasts': 0}

    def actuals(day):
        fetch_counts['actuals'] += 1
        return [{'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-15T09:00:00Z', 'fuelType': 'WIND', 'generation': 450}]

    def forecasts(day):
        fetch_counts['forecasts'] += 1
        return [{'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-13T15:00:00Z', 'generation': generation['value']}]

    monkeypatch.setattr(analysis_service, 'fetch_day_actuals', actuals)
    monkeypatch.setattr(analysis_service, 'fetch_day_forecasts', forecasts)

    first = analysis_service.get_analysis(date(2026, 1, 14), time(16, 0))
    assert first['metrics']['mae'] == 50
    generation['value'] = 700
    refreshed = analysis_service.get_analysis(date(2026, 1, 14), time(16, 0), refresh=True)
    assert refreshed['metrics']['mae'] == 250
    after_refresh = analysis_service.get_analysis(date(2026, 1, 14), time(16, 0))
    assert after_refresh['metrics']['mae'] == 250
    assert fetch_counts == {'actuals': 2, 'forecasts': 2}
    analysis_service.clear_cache()


def test_derived_results_are_keyed_by_cutoff_and_comparison_input_list(monkeypatch):
    analysis_service.clear_cache()
    counts = {'actuals': 0, 'forecasts': 0, 'analysis': 0}

    def actuals(day):
        counts['actuals'] += 1
        return [{'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-15T09:00:00Z', 'fuelType': 'WIND', 'generation': 450}]

    def forecasts(day):
        counts['forecasts'] += 1
        return [
            {'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-13T11:00:00Z', 'generation': 500},
            {'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-13T15:00:00Z', 'generation': 600},
            {'startTime': '2026-01-14T00:00:00Z', 'publishTime': '2026-01-13T17:00:00Z', 'generation': 999},
        ]

    original_analyze = analysis_service.analyze_day
    def counted_analyze(*args, **kwargs):
        counts['analysis'] += 1
        return original_analyze(*args, **kwargs)

    monkeypatch.setattr(analysis_service, 'fetch_day_actuals', actuals)
    monkeypatch.setattr(analysis_service, 'fetch_day_forecasts', forecasts)
    monkeypatch.setattr(analysis_service, 'analyze_day', counted_analyze)

    early = analysis_service.get_analysis(date(2026, 1, 14), time(12, 0))
    late = analysis_service.get_analysis(date(2026, 1, 14), time(16, 0))
    assert early['metrics']['mae'] == 50
    assert late['metrics']['mae'] == 150
    assert counts == {'actuals': 1, 'forecasts': 1, 'analysis': 2}
    # A repeated identical daily request is a derived-cache hit.
    assert analysis_service.get_analysis(date(2026, 1, 14), time(12, 0))['metrics']['mae'] == 50
    assert counts['analysis'] == 2

    first = analysis_service.get_cutoff_comparison(date(2026, 1, 14), [time(12, 0), time(16, 0)])
    assert [item['cutoff_time'] for item in first['cutoffs']] == ['12:00', '16:00']
    analyzed_after_first = counts['analysis']
    # Identical cutoff list should be served from the comparison cache.
    analysis_service.get_cutoff_comparison(date(2026, 1, 14), [time(12, 0), time(16, 0)])
    assert counts['analysis'] == analyzed_after_first
    # A different cutoff list gets a separate derived entry and re-evaluates scenarios.
    second = analysis_service.get_cutoff_comparison(date(2026, 1, 14), [time(12, 0), time(18, 0)])
    assert [item['cutoff_time'] for item in second['cutoffs']] == ['12:00', '18:00']
    assert second['cutoffs'][1]['metrics']['mae'] == 549
    assert counts['analysis'] == analyzed_after_first + 2
    assert counts['actuals'] == 1 and counts['forecasts'] == 1
    analysis_service.clear_cache()
