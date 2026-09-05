import ast
import importlib.util
import json
import string
import sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean

import numpy as np
import regex
from nltk.stem import PorterStemmer


def load_lme(root):
    path = root / 'longmemeval-v2/evaluation/qa_eval_metrics.py'
    spec = importlib.util.spec_from_file_location('official_lme_metrics', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_locomo(root):
    path = root / 'locomo/task_eval/evaluation.py'
    names = {'normalize_answer', 'f1_score', 'f1', 'eval_question_answering'}
    parsed = ast.parse(path.read_text(encoding='utf-8'))
    selected = ast.Module(body=[node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
    # 直接执行上游评分函数；仅省去这些函数未使用的 BERT/PyTorch 导入。
    namespace = {'np': np, 'regex': regex, 'string': string, 'Counter': Counter, 'ps': PorterStemmer()}
    exec(compile(selected, str(path), 'exec'), namespace)
    return namespace


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def group_metrics(rows, key):
    groups = defaultdict(list)
    for row in rows:
        groups[str(row[key])].append(row['score'])
    return {name: {'count': len(values), 'mean': mean(values)} for name, values in sorted(groups.items())}


def score_locomo(root, run):
    official = load_locomo(root)
    questions = read_json(run / 'locomo-questions.json')
    rows = []
    for question in questions:
        path = run / 'predictions' / f"{question['id']}.json"
        if not path.exists():
            continue
        prediction = read_json(path)
        item = dict(question, answer=question.get('answer', ''), prediction=prediction['prediction'])
        scores, _, _ = official['eval_question_answering']([item])
        rows.append({'id': question['id'], 'category': question['category'], 'score': float(scores[0])})
    answerable = [row['score'] for row in rows if row['category'] != 5]
    adversarial = [row['score'] for row in rows if row['category'] == 5]
    return {'benchmark': 'locomo', 'expected': len(questions), 'scored': len(rows),
            'answerable_f1': mean(answerable) if answerable else None,
            'adversarial_accuracy': mean(adversarial) if adversarial else None,
            'by_category': group_metrics(rows, 'category'), 'rows': rows}, []


def score_lme(root, run):
    official = load_lme(root)
    questions = read_json(run / 'lme-questions.json')
    rows = []
    pending = []
    for question in questions:
        path = run / 'predictions' / f"{question['id']}.json"
        if not path.exists():
            continue
        prediction = read_json(path)['prediction']
        parsed = official.extract_boxed_answer(prediction)
        function = official.eval_name(question['eval_function'])
        if official.is_unknown(parsed):
            score = 0
        elif function.startswith('llm_'):
            judgment_path = run / 'judgments' / f"{question['id']}.json"
            if not judgment_path.exists():
                builder = official._build_abstention_judge_messages if function == 'llm_abstention_checker' else official._build_gotchas_judge_messages
                messages = builder(question_text=question['question'], reference_answer=question['answer'],
                                   model_full_response=prediction, model_final_answer=parsed)
                pending.append({'id': question['id'], 'messages': messages})
                continue
            score = read_json(judgment_path)['label']
            if score not in (0, 1):
                raise ValueError(f"Invalid judgment for {question['id']}")
        else:
            score = official.score_to_bool(official.eval_from_spec(question['eval_function'], parsed, question['answer']))
        rows.append({'id': question['id'], 'domain': question['domain'], 'category': question['question_type'],
                     'score': int(score), 'unknown': official.is_unknown(parsed)})
    return {'benchmark': 'longmemeval-v2-small', 'expected': len(questions), 'scored': len(rows),
            'accuracy': mean(row['score'] for row in rows) if rows else None,
            'by_category': group_metrics(rows, 'category'), 'by_domain': group_metrics(rows, 'domain'),
            'rows': rows}, pending


def main():
    root = Path('.cache/nano-mem-eval').resolve()
    run = Path(sys.argv[1]).resolve()
    if root not in run.parents:
        raise ValueError('Run path must be inside the isolated evaluation directory')
    benchmark = sys.argv[2]
    result, pending = score_locomo(root, run) if benchmark == 'locomo' else score_lme(root, run)
    (run / f'{benchmark}-scores.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    (run / f'{benchmark}-pending-judges.json').write_text(json.dumps(pending, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in result.items() if key != 'rows'}))


if __name__ == '__main__':
    main()
