import os
import sys
import unittest


ROOT = os.path.dirname(os.path.dirname(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from content_writer import UserIntentSignalsModel, _validate_toolbar_intent_plan  # type: ignore


class IntentSignalsValidationTests(unittest.TestCase):
    def test_upscale_signal_enforces_expected_pattern(self):
        signals = UserIntentSignalsModel(asksUpscale=True)
        parsed = {"executeNodeIds": []}
        ops = []
        result = _validate_toolbar_intent_plan(
            message="irrelevant when signals are provided",
            parsed=parsed,
            operations=ops,
            workflow_state={"nodes": [], "edges": []},
            selected_node_ids=[],
            intent_signals=signals,
        )
        self.assertFalse(result["ok"])
        self.assertTrue(any("Upscale request" in e for e in result["errors"]))

    def test_no_signals_no_toolbar_constraints(self):
        signals = UserIntentSignalsModel()
        result = _validate_toolbar_intent_plan(
            message="generic request",
            parsed={},
            operations=[],
            workflow_state={"nodes": [], "edges": []},
            selected_node_ids=[],
            intent_signals=signals,
        )
        self.assertTrue(result["ok"])


if __name__ == "__main__":
    unittest.main()
