import json

with open('distrito-10/florida/json/ranking.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

fail_scores = [item['score'] for item in data['ranking'] if item.get('veredicto') == 'FAIL']
pass_scores = [item['score'] for item in data['ranking'] if item.get('veredicto') == 'PASS']

avg_fail = sum(fail_scores) / len(fail_scores) if fail_scores else 0
avg_pass = sum(pass_scores) / len(pass_scores) if pass_scores else 0

print('=' * 60)
print('ANÁLISIS DEL ARCHIVO: ranking.json (Distrito 10 - Florida)')
print('=' * 60)
print(f'Total pizzas en ranking: {len(data["ranking"])}')
print(f'Total pizzas PASS: {len(pass_scores)}')
print(f'Total pizzas FAIL: {len(fail_scores)}')
print('=' * 60)
print(f'Score promedio FAIL: {avg_fail:.2f}')
print(f'Score promedio PASS: {avg_pass:.2f}')
print(f'Score promedio general: {data["average_score"]}')
print('=' * 60)
if fail_scores:
    print(f'Mínimo score FAIL: {min(fail_scores)}')
    print(f'Máximo score FAIL: {max(fail_scores)}')
print('=' * 60)
