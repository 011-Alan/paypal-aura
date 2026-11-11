from setuptools import setup, find_packages

setup(
    name="aura-sdk",
    version="1.0.0",
    description="Official Python SDK for AURA Intelligent Financial Workspace & Developer Platform",
    packages=find_packages(),
    install_requires=[
        "requests>=2.28.0",
        "pydantic>=2.0.0",
    ],
    python_requires=">=3.8",
)
