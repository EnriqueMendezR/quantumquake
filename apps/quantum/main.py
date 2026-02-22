from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List

import numpy as np
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

app = FastAPI(title="QuantumQuake Quantum Microservice")


class ScoreRequest(BaseModel):
    features: List[List[float]] = Field(
        ...,
        description="List of feature vectors. Each vector must have exactly 4 floats in [0, 1].",
    )


class ScoreResponse(BaseModel):
    scores: List[float]


def _quantum_anomaly_score(feature_vector: List[float]) -> float:
    """
    Encode a 4-element feature vector into a 4-qubit circuit using Ry rotations,
    add nearest-neighbour CNOT entanglement, measure all qubits, and return the
    probability of the all-ones bitstring as an anomaly score.
    """
    if len(feature_vector) != 4:
        raise ValueError("Each feature vector must contain exactly 4 values.")

    qc = QuantumCircuit(4, 4)

    # Ry rotations: angle = feature * pi
    for i, f in enumerate(feature_vector):
        qc.ry(float(f) * np.pi, i)

    # CNOT entanglement between adjacent qubits
    for i in range(3):
        qc.cx(i, i + 1)

    # Measure all qubits into classical bits
    qc.measure(range(4), range(4))

    simulator = AerSimulator()
    job = simulator.run(qc, shots=1000)
    result = job.result()
    counts = result.get_counts()

    # Probability of the all-ones state "1111"
    all_ones_count = counts.get("1111", 0)
    return all_ones_count / 1000.0


@app.post("/quantum/score", response_model=ScoreResponse)
async def quantum_score(request: ScoreRequest):
    """
    Accept a list of feature vectors (each with 4 floats in [0, 1]) and return
    a quantum anomaly score for each one.
    """
    try:
        scores = [_quantum_anomaly_score(fv) for fv in request.features]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return ScoreResponse(scores=scores)


@app.post("/quantum/health")
async def health():
    """Confirm that the service is running and Qiskit is importable."""
    return {"status": "ok", "message": "Qiskit is running"}
