import unittest

from scripts.fix_chesshormuz_double_step import (
    BLACK_REGION_LINE,
    DOUBLE_STEP_LINE,
    WHITE_REGION_LINE,
    corrected_ini,
)


class FixChesshormuzDoubleStepTestCase(unittest.TestCase):
    def test_adds_both_explicit_double_step_regions(self) -> None:
        ini = f"[chesshormuz:chess]\ncastling = false\n{DOUBLE_STEP_LINE}\npromotionRegionWhite = *9\n"

        corrected = corrected_ini({"ini": ini})

        self.assertIsNotNone(corrected)
        assert corrected is not None
        self.assertIn(
            f"{DOUBLE_STEP_LINE}\n{WHITE_REGION_LINE}\n{BLACK_REGION_LINE}\n",
            corrected,
        )

    def test_is_idempotent(self) -> None:
        ini = f"[chesshormuz:chess]\n{DOUBLE_STEP_LINE}\n{WHITE_REGION_LINE}\n{BLACK_REGION_LINE}\n"

        self.assertIsNone(corrected_ini({"ini": ini}))

    def test_refuses_partially_updated_ini(self) -> None:
        ini = f"[chesshormuz:chess]\n{DOUBLE_STEP_LINE}\n{WHITE_REGION_LINE}\n"

        with self.assertRaisesRegex(RuntimeError, "refusing to modify"):
            corrected_ini({"ini": ini})

    def test_refuses_missing_ini(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "string ini field"):
            corrected_ini({})


if __name__ == "__main__":
    unittest.main()
