"""Application/domain services (ADR-008 modular monolith).

Services own business rules and transaction boundaries; FastAPI routes (M0.3+)
only parse requests and map responses. No generic repositories, managers or
service locators.
"""
