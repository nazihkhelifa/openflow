import os
import sys
import unittest


ROOT = os.path.dirname(os.path.dirname(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from content_writer import (  # type: ignore
    _build_capability_registry,
    _build_post_apply_verification,
    _operations_require_manual_approval,
    _summarize_operation_risks,
)


class CanvasControlPolicyTests(unittest.TestCase):
    def test_destructive_ops_require_approval(self):
        ops = [{"type": "removeNode", "nodeId": "n1"}]
        self.assertTrue(_operations_require_manual_approval(ops))

    def test_risk_summary_counts(self):
        ops = [
            {"type": "addNode", "nodeId": "a", "nodeType": "prompt"},
            {"type": "updateNode", "nodeId": "a", "data": {"prompt": "x"}},
            {"type": "removeEdge", "edgeId": "e1"},
        ]
        summary = _summarize_operation_risks(ops)
        self.assertEqual(summary["safe"], 1)
        self.assertEqual(summary["caution"], 1)
        self.assertEqual(summary["destructive"], 1)

    def test_post_apply_verification_deltas(self):
        workflow = {"nodes": [{"id": "a"}], "edges": [{"id": "e1"}]}
        ops = [
            {"type": "addNode", "nodeId": "b", "nodeType": "prompt"},
            {"type": "removeEdge", "edgeId": "e1"},
        ]
        check = _build_post_apply_verification(workflow, ops)
        self.assertTrue(check.ok)
        self.assertEqual(check.predictedNodeDelta, 1)
        self.assertEqual(check.predictedEdgeDelta, -1)

    def test_capability_registry_includes_selected_types(self):
        workflow = {
            "nodes": [
                {"id": "n1", "type": "generateImage"},
                {"id": "n2", "type": "prompt"},
            ],
            "edges": [],
        }
        registry = _build_capability_registry(workflow, ["n1"])
        self.assertIn("generateImage", registry.selectedNodeTypes)
        self.assertTrue(registry.canExecuteSelected)


if __name__ == "__main__":
    unittest.main()
