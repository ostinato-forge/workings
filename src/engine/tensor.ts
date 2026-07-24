type BackwardFn = () => void;
type SoftmaxOptions = { causal?: boolean };

export class Tensor {
  readonly rows: number;
  readonly cols: number;
  readonly data: Float64Array;
  readonly grad: Float64Array;
  private backwardFn: BackwardFn | null = null;
  private readonly parents: Tensor[] = [];

  private constructor(rows: number, cols: number, data?: Float64Array) {
    this.rows = rows;
    this.cols = cols;
    this.data = data ?? new Float64Array(rows * cols);
    this.grad = new Float64Array(rows * cols);
  }

  static zeros(rows: number, cols: number): Tensor {
    return new Tensor(rows, cols);
  }

  static from(rows: number, cols: number, values: number[]): Tensor {
    if (values.length !== rows * cols) {
      throw new Error(`shape mismatch: ${rows}x${cols} vs ${values.length}`);
    }
    return new Tensor(rows, cols, Float64Array.from(values));
  }

  at(r: number, c: number): number {
    return this.data[r * this.cols + c] as number;
  }

  private child(rows: number, cols: number, parents: Tensor[]): Tensor {
    const out = new Tensor(rows, cols);
    out.parents.push(...parents);
    return out;
  }

  private setBackward(fn: BackwardFn): void {
    this.backwardFn = fn;
  }

  matmul(other: Tensor): Tensor {
    if (this.cols !== other.rows) {
      throw new Error(`matmul shape: ${this.cols} vs ${other.rows}`);
    }
    const out = this.child(this.rows, other.cols, [this, other]);
    for (let i = 0; i < this.rows; i += 1) {
      for (let k = 0; k < this.cols; k += 1) {
        const a = this.data[i * this.cols + k] as number;
        if (a === 0) continue;
        for (let j = 0; j < other.cols; j += 1) {
          const outIndex = i * other.cols + j;
          const current = out.data[outIndex] as number;
          out.data[outIndex] =
            current + a * (other.data[k * other.cols + j] as number);
        }
      }
    }
    out.setBackward(() => {
      for (let i = 0; i < this.rows; i += 1) {
        for (let j = 0; j < other.cols; j += 1) {
          const g = out.grad[i * other.cols + j] as number;
          if (g === 0) continue;
          for (let k = 0; k < this.cols; k += 1) {
            const leftIndex = i * this.cols + k;
            const leftGrad = this.grad[leftIndex] as number;
            this.grad[leftIndex] =
              leftGrad + g * (other.data[k * other.cols + j] as number);
            const rightIndex = k * other.cols + j;
            const rightGrad = other.grad[rightIndex] as number;
            other.grad[rightIndex] =
              rightGrad + g * (this.data[i * this.cols + k] as number);
          }
        }
      }
    });
    return out;
  }

  add(other: Tensor): Tensor {
    const broadcast = other.rows === 1 && this.rows > 1;
    if (!broadcast && (other.rows !== this.rows || other.cols !== this.cols)) {
      throw new Error("add shape mismatch");
    }
    if (other.cols !== this.cols) throw new Error("add cols mismatch");
    const out = this.child(this.rows, this.cols, [this, other]);
    for (let i = 0; i < this.rows; i += 1) {
      for (let j = 0; j < this.cols; j += 1) {
        const b = broadcast
          ? (other.data[j] as number)
          : (other.data[i * this.cols + j] as number);
        out.data[i * this.cols + j] =
          (this.data[i * this.cols + j] as number) + b;
      }
    }
    out.setBackward(() => {
      for (let i = 0; i < this.rows; i += 1) {
        for (let j = 0; j < this.cols; j += 1) {
          const index = i * this.cols + j;
          const g = out.grad[index] as number;
          const leftGrad = this.grad[index] as number;
          this.grad[index] = leftGrad + g;
          if (broadcast) {
            const rightGrad = other.grad[j] as number;
            other.grad[j] = rightGrad + g;
          } else {
            const rightGrad = other.grad[index] as number;
            other.grad[index] = rightGrad + g;
          }
        }
      }
    });
    return out;
  }

  mul(other: Tensor): Tensor {
    if (other.rows !== this.rows || other.cols !== this.cols) {
      throw new Error("mul shape mismatch");
    }
    const out = this.child(this.rows, this.cols, [this, other]);
    for (let i = 0; i < out.data.length; i += 1) {
      out.data[i] = (this.data[i] as number) * (other.data[i] as number);
    }
    out.setBackward(() => {
      for (let i = 0; i < out.data.length; i += 1) {
        const leftGrad = this.grad[i] as number;
        this.grad[i] =
          leftGrad + (out.grad[i] as number) * (other.data[i] as number);
        const rightGrad = other.grad[i] as number;
        other.grad[i] =
          rightGrad + (out.grad[i] as number) * (this.data[i] as number);
      }
    });
    return out;
  }

  mulScalar(s: number): Tensor {
    const out = this.child(this.rows, this.cols, [this]);
    for (let i = 0; i < out.data.length; i += 1) {
      out.data[i] = (this.data[i] as number) * s;
    }
    out.setBackward(() => {
      for (let i = 0; i < out.data.length; i += 1) {
        const current = this.grad[i] as number;
        this.grad[i] = current + (out.grad[i] as number) * s;
      }
    });
    return out;
  }

  relu(): Tensor {
    const out = this.child(this.rows, this.cols, [this]);
    for (let i = 0; i < out.data.length; i += 1) {
      out.data[i] = Math.max(0, this.data[i] as number);
    }
    out.setBackward(() => {
      for (let i = 0; i < out.data.length; i += 1) {
        if ((this.data[i] as number) > 0) {
          const current = this.grad[i] as number;
          this.grad[i] = current + (out.grad[i] as number);
        }
      }
    });
    return out;
  }

  transpose(): Tensor {
    const out = this.child(this.cols, this.rows, [this]);
    for (let i = 0; i < this.rows; i += 1) {
      for (let j = 0; j < this.cols; j += 1) {
        out.data[j * this.rows + i] = this.data[i * this.cols + j] as number;
      }
    }
    out.setBackward(() => {
      for (let i = 0; i < this.rows; i += 1) {
        for (let j = 0; j < this.cols; j += 1) {
          const index = i * this.cols + j;
          const current = this.grad[index] as number;
          this.grad[index] =
            current + (out.grad[j * this.rows + i] as number);
        }
      }
    });
    return out;
  }

  sum(): Tensor {
    const out = this.child(1, 1, [this]);
    let total = 0;
    for (let i = 0; i < this.data.length; i += 1) {
      total += this.data[i] as number;
    }
    out.data[0] = total;
    out.setBackward(() => {
      const g = out.grad[0] as number;
      for (let i = 0; i < this.data.length; i += 1) {
        const current = this.grad[i] as number;
        this.grad[i] = current + g;
      }
    });
    return out;
  }

  softmaxRows(options: SoftmaxOptions = {}): Tensor {
    const out = this.child(this.rows, this.cols, [this]);
    for (let r = 0; r < this.rows; r += 1) {
      const limit = options.causal ? r + 1 : this.cols;
      let max = -Infinity;
      for (let c = 0; c < limit; c += 1) {
        max = Math.max(max, this.data[r * this.cols + c] as number);
      }
      let denom = 0;
      for (let c = 0; c < limit; c += 1) {
        const e = Math.exp((this.data[r * this.cols + c] as number) - max);
        out.data[r * this.cols + c] = e;
        denom += e;
      }
      for (let c = 0; c < limit; c += 1) {
        out.data[r * this.cols + c] =
          (out.data[r * this.cols + c] as number) / denom;
      }
      for (let c = limit; c < this.cols; c += 1) {
        out.data[r * this.cols + c] = 0;
      }
    }
    out.setBackward(() => {
      for (let r = 0; r < this.rows; r += 1) {
        const limit = options.causal ? r + 1 : this.cols;
        let dot = 0;
        for (let c = 0; c < limit; c += 1) {
          dot +=
            (out.grad[r * this.cols + c] as number) *
            (out.data[r * this.cols + c] as number);
        }
        for (let c = 0; c < limit; c += 1) {
          const p = out.data[r * this.cols + c] as number;
          const index = r * this.cols + c;
          const current = this.grad[index] as number;
          this.grad[index] =
            current + p * ((out.grad[index] as number) - dot);
        }
      }
    });
    return out;
  }

  static crossEntropyMean(logits: Tensor, targets: number[]): Tensor {
    if (targets.length !== logits.rows) {
      throw new Error("one target per logit row required");
    }
    const out = logits.child(1, 1, [logits]);
    const probabilities = new Float64Array(logits.data.length);
    let total = 0;
    for (let r = 0; r < logits.rows; r += 1) {
      let max = -Infinity;
      for (let c = 0; c < logits.cols; c += 1) {
        max = Math.max(max, logits.data[r * logits.cols + c] as number);
      }
      let denom = 0;
      for (let c = 0; c < logits.cols; c += 1) {
        denom += Math.exp(
          (logits.data[r * logits.cols + c] as number) - max,
        );
      }
      for (let c = 0; c < logits.cols; c += 1) {
        const index = r * logits.cols + c;
        probabilities[index] =
          Math.exp((logits.data[index] as number) - max) / denom;
      }
      const target = targets[r] as number;
      total +=
        max +
        Math.log(denom) -
        (logits.data[r * logits.cols + target] as number);
    }
    out.data[0] = total / logits.rows;
    out.setBackward(() => {
      const g = (out.grad[0] as number) / logits.rows;
      for (let r = 0; r < logits.rows; r += 1) {
        const target = targets[r] as number;
        for (let c = 0; c < logits.cols; c += 1) {
          const index = r * logits.cols + c;
          const current = logits.grad[index] as number;
          const oneHot = c === target ? 1 : 0;
          logits.grad[index] =
            current + g * ((probabilities[index] as number) - oneHot);
        }
      }
    });
    return out;
  }

  static gatherRows(table: Tensor, indices: number[]): Tensor {
    const out = table.child(indices.length, table.cols, [table]);
    indices.forEach((rowIndex, i) => {
      for (let c = 0; c < table.cols; c += 1) {
        out.data[i * table.cols + c] =
          table.data[rowIndex * table.cols + c] as number;
      }
    });
    out.setBackward(() => {
      indices.forEach((rowIndex, i) => {
        for (let c = 0; c < table.cols; c += 1) {
          const tableIndex = rowIndex * table.cols + c;
          const current = table.grad[tableIndex] as number;
          table.grad[tableIndex] =
            current + (out.grad[i * table.cols + c] as number);
        }
      });
    });
    return out;
  }

  backward(): void {
    if (this.rows * this.cols !== 1) {
      throw new Error("backward starts from a scalar");
    }
    const order: Tensor[] = [];
    const seen = new Set<Tensor>();
    const visit = (t: Tensor): void => {
      if (seen.has(t)) return;
      seen.add(t);
      for (const p of t.parents) visit(p);
      order.push(t);
    };
    visit(this);
    for (const tensor of order) tensor.grad.fill(0);
    this.grad[0] = 1;
    for (let i = order.length - 1; i >= 0; i -= 1) {
      (order[i] as Tensor).backwardFn?.();
    }
  }

  zeroGrad(): void {
    this.grad.fill(0);
  }
}
