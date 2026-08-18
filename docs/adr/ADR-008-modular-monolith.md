# ADR-008: Modular monolith

## Status
Accepted (frozen for M0)

## Context
M0 is a local single-user workbench. A microservice architecture would add deployment and network complexity without benefit. Overly generic abstractions (repositories, service locators) would add indirection without real duplication.

## Decision
Backend is a modular monolith: FastAPI routes → application/domain services → SQLAlchemy persistence. Routes parse/validate HTTP and map responses; services own business rules and transaction boundaries. No generic repository base class, no event/command bus, no microservices.

## Alternatives Considered
- Microservices: rejected (no scalability/team boundary need).
- Generic repository/service locator: rejected (no real repeated persistence pattern that needs abstraction).
- Anemic route-only design: rejected (business rules would leak into HTTP layer).

## Consequences
- Simple dependency flow and test seams.
- Services can be unit/integration tested directly with a real DB session.
