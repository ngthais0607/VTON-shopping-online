# MVP-First SOLID Backend Architecture

Date: 2026-10-11
Status: Approved conversational design, pending written-spec review
Target branch: `safe-mvp-remediation`

## 1. Purpose

Refactor the complete backend so another developer can understand, test, and extend it without tracing HTTP, database, and vendor-specific behavior through the same function. Apply SOLID and design patterns only where they reduce real coupling or duplication. The result must remain appropriate for an MVP: concrete by default, explicit at boundaries, and free of speculative layers.

This phase covers users, products, categories, orders, core utilities, background jobs, and external integrations. Frontend refactoring is a later phase. The current frontend may be temporarily incompatible because this backend phase is allowed to replace the API contract.

## 2. Success Criteria

- Routers contain HTTP concerns only: request parsing, authentication dependencies, one use-case call, and response declaration.
- Business rules and transaction boundaries are visible in feature services.
- FastAPI and vendor SDK exceptions do not leak into application logic.
- Request, response, and error contracts are typed and documented through OpenAPI.
- External queue, email, storage, and payment behavior is replaceable in tests through small explicit boundaries.
- Simple features remain simple; repository, domain, or presenter modules are introduced only with evidence.
- Existing database data remains valid unless a separately justified migration is required for correct behavior.
- All automated gates pass, and unavailable external checks are reported rather than claimed.
- `README.md` documents the resulting architecture, API prefix and error format, development commands, quality gates, and module-extension rules.

## 3. Non-Goals

- Maintaining backward compatibility with the current API.
- Updating the frontend to consume the new API in this phase.
- Implementing full Clean Architecture, CQRS, an event bus, a dependency-injection framework, a generic repository, or a generic unit-of-work abstraction.
- Introducing a transactional outbox before delivery guarantees become an explicit product requirement.
- Changing the database schema only to mirror architectural layers.

## 4. Chosen Approach

Use a feature-oriented layered architecture. Each feature owns its transport schemas, application use cases, persistence model, and router. Dependency flow is:

```text
HTTP request
    -> feature router
    -> feature use-case service
    -> SQLAlchemy model/session
    -> database

feature service
    -> small external port when replacement is useful
    -> concrete integration adapter
```

The default feature package contains only:

```text
features/<feature>/
  router.py
  schemas.py
  service.py
  model.py
```

Promote behavior to `domain.py` only when a meaningful policy can be understood and tested independently. Promote queries to `repository.py` only when they are repeated, complex, or need independent testing. A second implementation, repeated query, or independently testable rule is evidence; possible future need is not.

## 5. Target Structure

```text
backend/app/
  core/
    config.py
    database.py
    errors.py
    security.py

  features/
    users/
      model.py
      schemas.py
      service.py
      router.py
    products/
      model.py
      schemas.py
      service.py
      reviews.py
      images.py
      router.py
    categories/
      model.py
      schemas.py
      service.py
      router.py
    orders/
      model.py
      schemas.py
      domain.py
      service.py
      router.py

  integrations/
    queue.py
    email.py
    storage.py
    vietqr.py

  jobs/
    orders.py
    emails.py
```

Products keep review and image capabilities in separate modules because they have independent rules and the image lifecycle crosses the storage boundary. Orders retain a domain module because state transitions and inventory allocation are already independently meaningful policies. Categories do not gain extra layers.

If a service grows beyond roughly 250–300 lines because it contains distinct capabilities, split it by capability. File length alone does not authorize a new abstraction.

## 6. Responsibilities and Dependency Rules

### 6.1 Routers

Routers may:

- declare paths, status codes, response models, and authentication dependencies;
- accept validated transport schemas;
- call one application use case;
- return the typed use-case result.

Routers must not issue SQLAlchemy queries, call `commit()`, construct ORM objects, manually assemble response dictionaries, or call vendor SDKs.

### 6.2 Services

For the MVP, services are typed functions rather than stateful classes. One public service function represents one business use case. It may receive a SQLAlchemy `Session` plus only the external dependencies that the use case actually needs.

Services own the transaction boundary. A write use case performs its complete state change and commits once. Hidden commit helpers such as `save_to_db()` are removed. Rollback remains safe through the session lifecycle and explicit exception handling.

A cross-feature use case may query a related ORM model directly when that model is part of the same transaction. Checkout may therefore lock and update products from the order service. Service-to-service chains are reserved for reusing an actual business operation, not for hiding every model access.

### 6.3 Schemas and response mapping

Pydantic schemas define separate create, patch, and response contracts. ORM-compatible response models use `from_attributes=True`. A dedicated mapper is retained only for computed or aggregate output, such as checkout payment instructions, order tracking timelines, or externally derived image URLs.

### 6.4 Core

- `config.py` reads and validates environment configuration once.
- `database.py` owns engine/session construction and request-scoped session lifecycle.
- `errors.py` defines application errors and global FastAPI exception handlers.
- `security.py` owns token/password functions and authentication dependencies, not user business operations.

Core code must not import feature routers.

### 6.5 Integrations and jobs

Integrations contain vendor-specific configuration, SDK calls, and exception translation. Queue, email, storage, and payment boundaries use a small callable or `Protocol` only when the consuming use case benefits from substitution. No service container or DI framework is introduced; FastAPI dependency functions construct concrete adapters.

Jobs call the same feature services used by requests. They do not duplicate order expiration, email lookup, or transition logic.

## 7. Transactions and External Side Effects

- A service commit represents the successful completion of a database use case.
- Confirmation and welcome emails are best-effort after commit. An enqueue failure is logged without turning a committed request into a false failure.
- Storage upload finishes before image metadata is committed. If the database write fails, the uploaded object is removed as compensation.
- Business-critical external delivery must become a separately designed reliable-delivery feature; this MVP does not simulate an outbox with ad-hoc retries.
- Inventory reservation and order transitions keep row locking and vendor-database concurrency verification.

## 8. Error Model

Application code raises meaningful errors such as `ProductNotFound`, `DuplicateUser`, `InsufficientStock`, and `InvalidOrderTransition`. Global handlers translate them into one transport shape:

```json
{
  "code": "product_not_found",
  "message": "Product 42 was not found",
  "details": null
}
```

Pydantic continues to handle structural validation. Feature services handle business validation. Services, jobs, and integrations do not raise `HTTPException`.

Expected mappings include:

- missing resource -> 404;
- uniqueness or state conflict -> 409;
- authorization failure -> 403;
- invalid business command -> 400;
- schema validation -> 422.

Unexpected errors remain 500 and are logged without exposing internal exception details.

## 9. API Contract

All application routes move under `/api/v1`. The backend does not preserve aliases for the old route or query formats.

- A single resource returns its response DTO directly.
- Collections use `{items, total, limit, offset}`.
- Create uses `POST`.
- Full replacement uses `PUT`; partial updates use `PATCH`.
- Soft delete returns `204 No Content`.
- Query enum values use one spelling rather than supporting pairs such as `price_asc` and `price-asc`.
- Missing aggregate values remain absent or `null`; a product with no reviews does not receive a synthetic five-star rating.

The new OpenAPI document and API tests become the contract consumed by the later frontend phase.

## 10. Feature Boundaries

- Users: registration, login, refresh, profile, password changes, and admin user management. Uniqueness and credential rules live in its service.
- Products: catalog CRUD in `service.py`; review behavior in `reviews.py`; storage lifecycle in `images.py`.
- Categories: straightforward CRUD in one service module.
- Orders: checkout, inventory reservation, order queries, tracking, and state changes. Transition and inventory policies live in `domain.py`.
- Jobs: scheduling and worker entry points only; business behavior remains in the owning feature.
- Integrations: accept primitives or narrow DTOs and do not import routers.

## 11. Implementation Sequence

Refactor in vertical slices so each committed feature is internally consistent:

1. Establish core configuration, transaction conventions, errors, and exception handlers.
2. Refactor categories as the small reference feature.
3. Refactor products, including review and image capabilities.
4. Refactor users and authentication-related use cases.
5. Refactor orders after the common conventions are proven.
6. Route jobs and integrations through shared use cases.
7. Remove obsolete helpers and old API compatibility code.
8. Update `README.md` and the architecture/API documentation.
9. Run the complete review and verification suite.

Although backward API compatibility is not required, each slice must leave the backend test suite passing. The repository must not contain two competing internal patterns after the final slice.

## 12. Testing and Quality Gates

Tests are written before moving behavior:

- pure domain tests for order transitions and inventory policy;
- service tests using the isolated SQLAlchemy transaction fixture;
- API tests for authentication, status codes, response DTOs, and the common error shape;
- small fakes for queue, email, storage, and payment boundaries;
- contract tests for the new OpenAPI surface;
- MariaDB integration tests for row locking, concurrent checkout, and migration behavior.

Required gates:

- `ruff check`;
- `ruff format --check`;
- Python compilation;
- the complete pytest suite with SQLAlchemy warnings promoted to errors;
- Alembic upgrade on an empty database;
- MariaDB concurrency tests when a disposable service is reachable;
- a dependency-boundary check proving routers contain no query, commit, or vendor-SDK calls and core/integrations do not import routers.

If an external service is unavailable, the exact blocked test is reported and is not described as passing.

## 13. README Deliverable

After implementation, `README.md` must be updated to match the code rather than describe the previous architecture. It must include:

- the MVP-first architecture and dependency direction;
- the resulting backend directory tree;
- the `/api/v1` convention and common error response;
- local setup and environment variables;
- database migration, seed, worker, and server commands;
- test, Ruff, compilation, and integration-test commands;
- the rule for promoting code into `domain.py` or `repository.py`;
- a clear note that the frontend must be updated to the new API in the next phase.

## 14. Final Review

The final review evaluates:

- whether every abstraction has current value;
- router/service responsibility and dependency direction;
- transaction, rollback, concurrency, uniqueness, and inventory correctness;
- authentication and authorization;
- error consistency, response typing, and OpenAPI accuracy;
- duplication, naming, module size, and onboarding clarity;
- whether tests assert behavior rather than implementation details;
- whether README instructions reproduce the verified workflow.

Findings are reported by severity. Critical and High findings must be fixed before integration. External verification gaps and remaining Low findings are documented explicitly.

## 15. Alternatives Rejected

### Full Clean Architecture

Repository and unit-of-work interfaces for every feature would maximize theoretical replaceability but add mappings, files, and concepts without a second database or delivery mechanism. This conflicts with the onboarding and MVP goals.

### Service-only extraction

Moving router code into large services without explicit transaction and external boundaries is fast initially but recreates the same coupling in a different file. It does not meet the testability goal.

### Pattern-per-concept architecture

Factories, strategies, repositories, presenters, and interfaces are not created merely because a named pattern exists. The selected design uses Service Layer, Adapter, and Policy patterns only where current behavior demonstrates their value.
