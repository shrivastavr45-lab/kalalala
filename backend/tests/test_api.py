from fastapi.testclient import TestClient

from app.main import app
from app.services.elexon_client import ElexonAPIError

client = TestClient(app)


def test_health():
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
    assert response.json()['data_mode'] == 'live-elexon-only'


def test_dates_restrict_to_january_2026():
    payload = client.get('/api/dates').json()
    assert len(payload['dates']) == 31
    assert payload['dates'][0] == '2026-01-01'
    assert payload['dates'][-1] == '2026-01-31'


def test_invalid_date_is_rejected():
    response = client.get('/api/analysis?date=2026-02-01&cutoff_time=16:00')
    assert response.status_code == 422


def test_invalid_cutoff_is_rejected():
    response = client.get('/api/analysis?date=2026-01-14&cutoff_time=25:99')
    assert response.status_code == 422


def test_elexon_failure_returns_502_without_sample_data(monkeypatch):
    def fail(*args, **kwargs):
        raise ElexonAPIError("Elexon is unavailable in this test.")
    monkeypatch.setattr('app.api.routes.get_analysis', fail)
    response = client.get('/api/analysis?date=2026-01-14&cutoff_time=16:00')
    assert response.status_code == 502
    assert response.json()['detail'] == 'Elexon is unavailable in this test.'


def test_overview_endpoint_returns_monthly_json_shape(monkeypatch):
    expected = {"period_start": "2026-01-01", "period_end": "2026-01-31", "partial": False}
    monkeypatch.setattr('app.api.routes.get_month_overview', lambda cutoff, refresh=False: expected)
    response = client.get('/api/overview?cutoff_time=14:00')
    assert response.status_code == 200
    assert response.json() == expected


def test_cutoff_comparison_validates_unique_times():
    response = client.get('/api/cutoff-comparison?date=2026-01-14&cutoff_times=12:00,12:00')
    assert response.status_code == 422
    assert 'unique' in response.json()['detail']


def test_cutoff_comparison_validates_out_of_scope_date():
    response = client.get('/api/cutoff-comparison?date=2026-02-01&cutoff_times=12:00,16:00')
    assert response.status_code == 422


def test_cutoff_comparison_endpoint_passes_parsed_values(monkeypatch):
    captured = {}
    def fake(selected_date, cutoffs, refresh=False):
        captured['date'] = selected_date
        captured['cutoffs'] = cutoffs
        captured['refresh'] = refresh
        return {'delivery_date': selected_date.isoformat(), 'cutoffs': [item.strftime('%H:%M') for item in cutoffs]}
    monkeypatch.setattr('app.api.routes.get_cutoff_comparison', fake)
    response = client.get('/api/cutoff-comparison?date=2026-01-14&cutoff_times=12:00,16:00&refresh=true')
    assert response.status_code == 200
    assert captured['date'].isoformat() == '2026-01-14'
    assert [item.strftime('%H:%M') for item in captured['cutoffs']] == ['12:00', '16:00']
    assert captured['refresh'] is True


def test_privacy_terms_and_favicon_routes_have_static_fallbacks(tmp_path, monkeypatch):
    from app import main as main_module
    static_dir = tmp_path / 'static'
    static_dir.mkdir()
    (static_dir / 'index.html').write_text('<!doctype html><title>Wind Forecast Intelligence</title>')
    (static_dir / 'wind-mark.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    monkeypatch.setattr(main_module, 'STATIC_DIR', static_dir)
    response = client.get('/privacy')
    assert response.status_code == 200
    assert 'Wind Forecast Intelligence' in response.text
    assert client.get('/terms').status_code == 200
    assert client.get('/wind-mark.svg').status_code == 200


def test_monthly_overview_upstream_failure_is_explicit_partial_result(monkeypatch):
    payload = {
        'partial': True,
        'coverage': {'days_requested': 31, 'days_retrieved': 0, 'days_failed': 31},
        'daily': [{'delivery_date': '2026-01-01', 'status': 'error', 'error': 'upstream unavailable'}],
        'monthly_metrics': {'mae': None, 'rmse': None, 'bias': None, 'valid_count': 0},
    }
    monkeypatch.setattr('app.api.routes.get_month_overview', lambda cutoff, refresh=False: payload)
    response = client.get('/api/overview')
    assert response.status_code == 200
    assert response.json()['partial'] is True
    assert response.json()['monthly_metrics']['mae'] is None
    assert response.json()['daily'][0]['status'] == 'error'
