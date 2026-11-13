from iq_core import __version__


def test_core_package_exposes_version() -> None:
    assert __version__ == "0.1.0"
