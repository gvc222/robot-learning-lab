// Computer vision for robots, a companion to Stanford CS231n: convolution, nearest neighbours, linear classifiers, autograd, CNN shapes, detection.
const L = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
const defined = (body) => `<div class="card" style="margin:8px 0"><b>Already defined for you</b>: ${body}</div>`;

export const COURSES9 = [
  { id: 'vision', title: 'Computer vision (CS231n companion)', blurb: 'Convolution, classifiers, gradients, CNNs and detection, built from scratch in plain Python, with a robot-vision angle.' },
];

// A tiny synthetic image dataset: 8x8 pictures of a plus, a box and a diagonal, jittered and noisy. Pure Python, deterministic.
const DATA = `import math, random
def _picture(label, rnd):
    im = [[0.0] * 8 for _ in range(8)]
    dx, dy = rnd.randint(-2, 2), rnd.randint(-2, 2)
    def put(x, y):
        x += dx; y += dy
        if 0 <= x < 8 and 0 <= y < 8:
            im[y][x] = 1.0
    if label == 0:                      # plus
        for i in range(1, 7):
            put(3, i); put(i, 3)
    elif label == 1:                    # box outline
        for i in range(2, 6):
            put(i, 2); put(i, 5); put(2, i); put(5, i)
    else:                               # diagonal
        for i in range(1, 7):
            put(i, i)
    flat = [min(1.0, max(0.0, v + rnd.gauss(0, 0.3))) for row in im for v in row]
    return flat
def _make(n_per_class, seed):
    rnd = random.Random(seed)
    data = [(_picture(c, rnd), c) for _ in range(n_per_class) for c in range(3)]
    rnd.shuffle(data)
    return data
TRAIN = _make(30, 1)
TEST = _make(20, 2)
CLASSES = ["plus", "box", "diagonal"]
`;

export const MORE9 = [
  {
    id: 'cv_conv', course: 'vision', title: '1 · Images are arrays: convolution', viz: 'convlab',
    text: `<p>A grayscale image is a grid of numbers (0 = black, 1 = white). Almost all of classical and deep vision is built on one operation: slide a small grid of weights, a <b>kernel</b>, over the image, and at every position multiply and add. A kernel with positive weights on one side and negative on the other responds to an <b>edge</b>; a kernel of equal weights <b>blurs</b>.</p>
<p>Formally (what deep-learning libraries call convolution is really cross-correlation, with no flipping of the kernel):</p>
<p class="mono">out[i][j] = Σ<sub>a,b</sub> kernel[a][b] · padded[i·stride + a][j·stride + b]</p>
<p>Three knobs matter, and CS231n’s first CNN lecture is built on them: <b>padding</b> (zeros around the border so the output does not shrink), <b>stride</b> (how many pixels you jump), and the kernel size. The output side length is <code>(n + 2·pad − k) // stride + 1</code>.</p>
${defined('<code>img</code> (a list of rows of numbers) is what the bench passes to <code>convolve2d</code>. <b>You write</b> <code>convolve2d(img, kernel, stride=1, pad=0)</code>, which returns the output as a list of rows, and <code>conv_out(n, k, stride, pad)</code>, the output side length.')}
<p><b>Your task</b>: write both. The bench runs <i>your</i> function over a test picture with the kernel you choose (edge detectors, blur, sharpen): see what each kernel “looks for”.</p>`,
    pre: 'import math\n',
    starter: `def conv_out(n, k, stride, pad):
    return ...

def convolve2d(img, kernel, stride=1, pad=0):
    h, w, k = len(img), len(img[0]), len(kernel)
    # zero-pad the image
    padded = [[0.0] * (w + 2 * pad) for _ in range(h + 2 * pad)]
    for y in range(h):
        for x in range(w):
            padded[y + pad][x + pad] = img[y][x]
    oh, ow = conv_out(h, k, stride, pad), conv_out(w, k, stride, pad)
    out = []
    for i in range(oh):
        row = []
        for j in range(ow):
            total = 0.0
            for a in range(k):
                for b in range(k):
                    total += ...
            row.append(total)
        out.append(row)
    return out
`,
    solution: `def conv_out(n, k, stride, pad):
    return (n + 2 * pad - k) // stride + 1

def convolve2d(img, kernel, stride=1, pad=0):
    h, w, k = len(img), len(img[0]), len(kernel)
    padded = [[0.0] * (w + 2 * pad) for _ in range(h + 2 * pad)]
    for y in range(h):
        for x in range(w):
            padded[y + pad][x + pad] = img[y][x]
    oh, ow = conv_out(h, k, stride, pad), conv_out(w, k, stride, pad)
    out = []
    for i in range(oh):
        row = []
        for j in range(ow):
            total = 0.0
            for a in range(k):
                for b in range(k):
                    total += kernel[a][b] * padded[i * stride + a][j * stride + b]
            row.append(total)
        out.append(row)
    return out
`,
    hint: 'Output size: <code>(n + 2 * pad - k) // stride + 1</code>. Inner line: <code>total += kernel[a][b] * padded[i * stride + a][j * stride + b]</code>.',
    tests: [
      ['output size formula', `assert conv_out(32, 5, 1, 0) == 28\nassert conv_out(32, 3, 1, 1) == 32\nassert conv_out(224, 7, 2, 3) == 112\nassert conv_out(10, 2, 2, 0) == 5`],
      ['an identity kernel returns the image', `img = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]\nk = [[0, 0, 0], [0, 1, 0], [0, 0, 0]]\nassert convolve2d(img, k, 1, 1) == [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0], [7.0, 8.0, 9.0]]`],
      ['a known 3x3 result, without padding', `img = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]\nk = [[1, 0, -1], [1, 0, -1], [1, 0, -1]]\nassert convolve2d(img, k) == [[-6.0]]`],
      ['padding keeps the size and stride shrinks it', `img = [[1.0] * 8 for _ in range(8)]\nb = [[1 / 9] * 3 for _ in range(3)]\nassert len(convolve2d(img, b, 1, 1)) == 8\nassert len(convolve2d(img, b, 2, 1)) == 4`],
      ['a box blur leaves a flat region flat', `img = [[0.5] * 6 for _ in range(6)]\nb = [[1 / 9] * 3 for _ in range(3)]\nout = convolve2d(img, b)\nassert all(abs(v - 0.5) < 1e-9 for r in out for v in r)`],
    ],
  },
  {
    id: 'cv_knn', course: 'vision', title: '2 · Image classification: nearest neighbours', viz: 'knnlab',
    text: `<p>The <b>image classification</b> problem: given a picture, name its category. The first, simplest, data-driven answer is <b>k-nearest neighbours</b>: store all training images; to classify a new one, find the <code>k</code> closest training images and take a vote.</p>
<p>“Closest” needs a distance. The L2 (Euclidean) distance between two images treats each as one long vector of pixels: <code>d(a, b) = √Σ(aᵢ − bᵢ)²</code>. It is wonderfully simple and has two famous weaknesses (CS231n spends a lecture on them): it is slow at test time (compare against every training image), and pixel distance says little about meaning (a shifted bar is “far” from the same bar).</p>
<p>The dataset here is tiny and synthetic: 8×8 pictures of a <b>plus</b>, a <b>box</b> and a <b>diagonal</b>, shifted by up to two pixels and noisy. The shift is the point: it makes pixel-wise comparison struggle, motivating convolutions later.</p>
${defined('<code>TRAIN</code> and <code>TEST</code>: lists of <code>(pixels, label)</code>, where <code>pixels</code> is a flat list of 64 numbers and <code>label</code> is 0, 1 or 2; <code>CLASSES</code>; <code>math</code>. <b>You write</b> <code>l2(a, b)</code> and <code>knn_predict(train, x, k)</code> (returns the winning label).')}
<p><b>Your task</b>: write both. The bench plots test accuracy against <code>k</code> and shows some images your classifier gets wrong. Expect k = 1 to do best here (around 85%) and more neighbours to do <i>worse</i>: with so few examples per class, distant neighbours are mostly wrong-class pictures.</p>`,
    pre: DATA,
    starter: `def l2(a, b):
    return ...

def knn_predict(train, x, k):
    # sort the training set by distance to x, keep the k closest, and return the most common label
    nearest = sorted(train, key=lambda item: ...)[:k]
    votes = {}
    for pixels, label in nearest:
        votes[label] = votes.get(label, 0) + 1
    return ...
`,
    solution: `def l2(a, b):
    return math.sqrt(sum((p - q) ** 2 for p, q in zip(a, b)))

def knn_predict(train, x, k):
    nearest = sorted(train, key=lambda item: l2(item[0], x))[:k]
    votes = {}
    for pixels, label in nearest:
        votes[label] = votes.get(label, 0) + 1
    return max(votes, key=lambda c: (votes[c], -c))
`,
    hint: 'Distance: <code>math.sqrt(sum((p - q) ** 2 for p, q in zip(a, b)))</code>. Sort key: <code>l2(item[0], x)</code>. Winner: <code>max(votes, key=lambda c: votes[c])</code>.',
    tests: [
      ['l2 distance', `assert abs(l2([0, 0], [3, 4]) - 5) < 1e-12 and l2([1, 2, 3], [1, 2, 3]) == 0`],
      ['k = 1 returns the label of the closest point', `tr = [([0, 0], 0), ([10, 10], 1), ([0, 1], 2)]\nassert knn_predict(tr, [0.1, 0.9], 1) == 2`],
      ['k = 3 takes a vote', `tr = [([0, 0], 0), ([0.2, 0], 0), ([5, 5], 1), ([0.1, 0.1], 0), ([9, 9], 1)]\nassert knn_predict(tr, [0.0, 0.0], 3) == 0`],
      ['with k = 1 it classifies most test pictures correctly', `ok = sum(knn_predict(TRAIN, x, 1) == y for x, y in TEST)\nassert ok / len(TEST) >= 0.75, "only %d of %d right" % (ok, len(TEST))`],
    ],
  },
  {
    id: 'cv_linear', course: 'vision', title: '3 · Linear classifier: softmax and gradients', viz: 'linlab',
    text: `<p>A <b>linear classifier</b> gives each class a template: one weight per pixel. The class score is the dot product of the image with the template, plus a bias: <code>scores = W·x + b</code>. The class with the highest score wins. Unlike kNN, all the work happens in training; prediction is one matrix multiply.</p>
<p>To train it we need a <b>loss</b> that turns scores into a number to minimise. <b>Softmax cross-entropy</b> first turns scores into probabilities, <code>p<sub>c</sub> = e<sup>s<sub>c</sub></sup> / Σ e<sup>s</sup></code>, then charges <code>−log p<sub>y</sub></code> for the true class y. Subtract the maximum score before exponentiating, or large scores overflow. The gradient is beautifully simple: with <code>p</code> the probabilities and a 1 subtracted at the true class, <code>∂L/∂s = p − onehot(y)</code>, so <code>∂L/∂W[c][d] = (p<sub>c</sub> − 1[c=y])·x<sub>d</sub></code> and <code>∂L/∂b[c] = p<sub>c</sub> − 1[c=y]</code>.</p>
<p>Always <b>check your gradient numerically</b> (nudge one weight by ε and compare the change in loss): the single most useful debugging habit in deep learning, and the tests below do exactly that.</p>
${defined('<code>TRAIN</code>, <code>TEST</code>, <code>CLASSES</code>, <code>math</code>. <b>You write</b> <code>softmax(scores)</code> and <code>loss_and_grad(W, b, x, y)</code>, where <code>W</code> is a list of 3 rows of 64 weights and <code>b</code> a list of 3 numbers. Return <code>(loss, dW, db)</code> with <code>dW</code> and <code>db</code> shaped like <code>W</code> and <code>b</code>.')}
<p><b>Your task</b>: write both. Expect it to reach only about 55–60% on this shifted data (worse than kNN): one template per class cannot cope with shifts, which is exactly the weakness convolution fixes. The bench trains the classifier by stochastic gradient descent with <i>your</i> loss and gradient, plots the loss, and draws each class’s learned <b>template</b> as an image: red where the weight is positive, blue where it is negative.</p>`,
    pre: DATA,
    starter: `def softmax(scores):
    m = max(scores)
    exps = [math.exp(s - m) for s in scores]
    z = sum(exps)
    return ...

def loss_and_grad(W, b, x, y):
    scores = [sum(w * xi for w, xi in zip(row, x)) + bias for row, bias in zip(W, b)]
    p = softmax(scores)
    loss = -math.log(p[y])
    ds = list(p)
    ds[y] -= 1.0
    dW = [[... for xi in x] for c in range(len(W))]
    db = ...
    return loss, dW, db
`,
    solution: `def softmax(scores):
    m = max(scores)
    exps = [math.exp(s - m) for s in scores]
    z = sum(exps)
    return [e / z for e in exps]

def loss_and_grad(W, b, x, y):
    scores = [sum(w * xi for w, xi in zip(row, x)) + bias for row, bias in zip(W, b)]
    p = softmax(scores)
    loss = -math.log(p[y])
    ds = list(p)
    ds[y] -= 1.0
    dW = [[ds[c] * xi for xi in x] for c in range(len(W))]
    db = list(ds)
    return loss, dW, db
`,
    hint: 'Probabilities: <code>[e / z for e in exps]</code>. Weight gradient for class c and pixel d is <code>ds[c] * x[d]</code>; the bias gradient is just <code>list(ds)</code>.',
    tests: [
      ['softmax gives probabilities that sum to 1', `p = softmax([1.0, 2.0, 3.0])\nassert abs(sum(p) - 1) < 1e-12 and p[2] > p[1] > p[0]\nassert abs(softmax([1000, 1001, 1002])[2] - softmax([0, 1, 2])[2]) < 1e-9, "subtract the max for stability"`],
      ['with zero weights the loss is log(3)', `W = [[0.0] * 64 for _ in range(3)]\nloss, dW, db = loss_and_grad(W, [0.0] * 3, TRAIN[0][0], TRAIN[0][1])\nassert abs(loss - math.log(3)) < 1e-9`],
      ['the gradient matches a numerical derivative', `import random\nr = random.Random(0)\nW = [[r.gauss(0, 0.1) for _ in range(64)] for _ in range(3)]\nb = [0.1, -0.1, 0.0]\nx, y = TRAIN[3]\nloss, dW, db = loss_and_grad(W, b, x, y)\nfor (c, d) in [(0, 5), (1, 27), (2, 40)]:\n    h = 1e-6; W[c][d] += h\n    l2_ = loss_and_grad(W, b, x, y)[0]; W[c][d] -= h\n    assert abs((l2_ - loss) / h - dW[c][d]) < 1e-4, "dW[%d][%d] is off: %.5f vs numeric %.5f" % (c, d, dW[c][d], (l2_ - loss) / h)\nh = 1e-6; b[1] += h\nl2_ = loss_and_grad(W, b, x, y)[0]\nassert abs((l2_ - loss) / h - db[1]) < 1e-4, "db is off"`],
    ],
  },
  {
    id: 'cv_autograd', course: 'vision', title: '4 · Backpropagation: build a tiny autograd', viz: 'autolab',
    text: `<p>A linear classifier has a one-line gradient. A deep network does not, but its <b>loss is a long chain of simple operations</b>, and the chain rule handles any chain. <b>Backpropagation</b> is that rule applied from the output backwards: every node learns how much the final loss changes if it changes, by multiplying the gradient arriving from above by its own local derivative.</p>
<p>The local derivatives are tiny: for <code>c = a + b</code>, both inputs get the output gradient unchanged; for <code>c = a·b</code>, <code>a</code> gets <code>b·grad</code> and <code>b</code> gets <code>a·grad</code>; for <code>relu(a)</code>, the gradient passes only where <code>a &gt; 0</code>. A value used twice gets the <b>sum</b> of the gradients from each use (so accumulate with <code>+=</code>, never <code>=</code>).</p>
<p>To run backward in the right order, visit nodes in <b>reverse topological order</b>: a node’s gradient must be complete before it passes anything on to its inputs. This is the whole idea behind PyTorch’s autograd, in about 30 lines.</p>
${defined('<code>math</code>, and a <code>Value</code> class skeleton with <code>__add__</code> done. The bench has a function <code>train_toy()</code> that builds a 2-8-1 network out of <code>Value</code> objects and trains it on a two-ring toy problem. <b>You write</b> <code>__mul__</code>, <code>relu</code> and <code>backward</code> (the reverse-topological pass) inside the class.')}
<p><b>Your task</b>: complete the class. The tests compare your gradients with numerical derivatives; then the bench trains a real network built from <i>your</i> autograd and draws its decision boundary.</p>`,
    pre: `import math, random
def train_toy(steps=50, lr=0.1):
    r = random.Random(0)
    pts = []
    for i in range(40):
        a = r.uniform(0, 6.2832); rad = 0.5 if i % 2 == 0 else 1.5
        pts.append(((rad * math.cos(a) + r.gauss(0, 0.1), rad * math.sin(a) + r.gauss(0, 0.1)), 1.0 if i % 2 == 0 else -1.0))
    H = 8
    W1 = [[Value(r.gauss(0, 0.8)) for _ in range(2)] for _ in range(H)]
    b1 = [Value(0.0) for _ in range(H)]
    W2 = [Value(r.gauss(0, 0.8)) for _ in range(H)]
    b2 = Value(0.0)
    params = [v for row in W1 for v in row] + b1 + W2 + [b2]
    def forward(x0, x1):
        hid = []
        for j in range(H):
            hid.append((W1[j][0] * x0 + W1[j][1] * x1 + b1[j]).relu())
        out = b2
        for j in range(H):
            out = out + W2[j] * hid[j]
        return out
    losses = []
    for step in range(steps):
        for p in params:
            p.grad = 0.0
        loss = Value(0.0)
        for (x0, x1), y in pts:
            d = forward(x0, x1) + (-y)
            loss = loss + d * d
        loss = loss * (1.0 / len(pts))
        loss.backward()
        for p in params:
            p.data -= lr * p.grad
        losses.append(loss.data)
    grid = [[forward(-2 + 4 * i / 19, -2 + 4 * j / 19).data for i in range(20)] for j in range(20)]
    return losses, grid, [(p, y) for p, y in pts]
`,
    starter: `class Value:
    def __init__(self, data, children=()):
        self.data = data
        self.grad = 0.0
        self._children = children
        self._backward = lambda: None

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other))
        def _backward():
            self.grad += out.grad
            other.grad += out.grad
        out._backward = _backward
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other))
        def _backward():
            self.grad += ...
            other.grad += ...
        out._backward = _backward
        return out

    def __neg__(self):
        return self * -1.0

    def relu(self):
        out = Value(self.data if self.data > 0 else 0.0, (self,))
        def _backward():
            self.grad += ...
        out._backward = _backward
        return out

    def backward(self):
        order, seen = [], set()
        def visit(v):
            if v not in seen:
                seen.add(v)
                for c in v._children:
                    visit(c)
                order.append(v)
        visit(self)
        self.grad = 1.0
        for v in ...:          # reverse topological order
            v._backward()
`,
    solution: `class Value:
    def __init__(self, data, children=()):
        self.data = data
        self.grad = 0.0
        self._children = children
        self._backward = lambda: None

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other))
        def _backward():
            self.grad += out.grad
            other.grad += out.grad
        out._backward = _backward
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other))
        def _backward():
            self.grad += other.data * out.grad
            other.grad += self.data * out.grad
        out._backward = _backward
        return out

    def __neg__(self):
        return self * -1.0

    def relu(self):
        out = Value(self.data if self.data > 0 else 0.0, (self,))
        def _backward():
            self.grad += (1.0 if self.data > 0 else 0.0) * out.grad
        out._backward = _backward
        return out

    def backward(self):
        order, seen = [], set()
        def visit(v):
            if v not in seen:
                seen.add(v)
                for c in v._children:
                    visit(c)
                order.append(v)
        visit(self)
        self.grad = 1.0
        for v in reversed(order):
            v._backward()
`,
    hint: 'Multiplication: <code>self.grad += other.data * out.grad</code> and <code>other.grad += self.data * out.grad</code>. ReLU: <code>(1.0 if self.data &gt; 0 else 0.0) * out.grad</code>. The last loop is <code>for v in reversed(order):</code>.',
    tests: [
      ['gradient of a*b + c', `a, b, c = Value(2.0), Value(-3.0), Value(10.0)\nd = a * b + c\nd.backward()\nassert d.data == 4.0 and a.grad == -3.0 and b.grad == 2.0 and c.grad == 1.0, (a.grad, b.grad, c.grad)`],
      ['a value used twice gets the sum of both gradients', `a = Value(3.0)\nb = a * a + a\nb.backward()\nassert abs(a.grad - 7.0) < 1e-12, a.grad`],
      ['relu passes gradient only for positive inputs', `x, y = Value(2.0), Value(-1.0)\n(x.relu() + y.relu()).backward()\nassert x.grad == 1.0 and y.grad == 0.0`],
      ['gradients match numerical derivatives through a small expression', `def f(x, y):\n    return ((x * y + 3.0).relu() * x + y * y)\nx, y = Value(0.7), Value(-1.3)\nout = f(x, y); out.backward()\nh = 1e-6\nfx = (f(Value(0.7 + h), Value(-1.3)).data - out.data) / h\nfy = (f(Value(0.7), Value(-1.3 + h)).data - out.data) / h\nassert abs(fx - x.grad) < 1e-4 and abs(fy - y.grad) < 1e-4, (fx, x.grad, fy, y.grad)`],
      ['a network built from your Value class learns', `losses, grid, pts = train_toy()\nassert losses[-1] < losses[0] * 0.8, "loss went from %.3f to %.3f" % (losses[0], losses[-1])`],
    ],
  },
  {
    id: 'cv_shapes', course: 'vision', title: '5 · CNN bookkeeping: sizes, parameters, receptive field',
    text: `<p>Before training a CNN you can already predict a lot about it with arithmetic. Three numbers matter, and interviews and exams love them:</p>
<ul><li><b>Output size</b> of a conv or pooling layer: <code>(n + 2·pad − k) // stride + 1</code> (you wrote this in lesson 1).</li><li><b>Parameters</b> in a conv layer: every output channel has one <code>k×k×c<sub>in</sub></code> filter plus a bias, so <code>c<sub>out</sub> · (k·k·c<sub>in</sub> + 1)</code>. Weight sharing is why this is tiny compared with a fully connected layer on the same image.</li><li><b>Receptive field</b>: how many input pixels one output unit can “see”. Walk through the layers keeping the receptive field <code>rf</code> and the <b>jump</b> (the pixel distance between neighbouring units, which starts at 1): for each layer with kernel <code>k</code> and stride <code>s</code>, <code>rf += (k − 1)·jump</code>, then <code>jump *= s</code>. Stacking three 3×3 convolutions sees 7×7 pixels with fewer parameters than one 7×7 filter, the VGG insight.</li></ul>
${defined('<code>math</code>. <b>You write</b> <code>conv_params(c_in, c_out, k)</code> (including biases), <code>fc_params(n_in, n_out)</code> (a fully connected layer, with biases), <code>receptive_field(layers)</code> (a list of <code>(k, stride)</code> pairs, returns the size), and <code>shapes(n, layers)</code> (the side length after each <code>(k, stride, pad)</code> layer, as a list).')}
<p><b>Your task</b>: write all four, using the numbers from the tests as sanity checks (the first conv layer of ResNet has a 7×7 kernel, 64 filters, stride 2, pad 3).</p>`,
    pre: 'import math\n',
    starter: `def conv_params(c_in, c_out, k):
    return ...

def fc_params(n_in, n_out):
    return ...

def receptive_field(layers):
    rf, jump = 1, 1
    for k, s in layers:
        rf += ...
        jump *= s
    return rf

def shapes(n, layers):
    out = []
    for k, s, p in layers:
        n = ...
        out.append(n)
    return out
`,
    solution: `def conv_params(c_in, c_out, k):
    return c_out * (k * k * c_in + 1)

def fc_params(n_in, n_out):
    return n_in * n_out + n_out

def receptive_field(layers):
    rf, jump = 1, 1
    for k, s in layers:
        rf += (k - 1) * jump
        jump *= s
    return rf

def shapes(n, layers):
    out = []
    for k, s, p in layers:
        n = (n + 2 * p - k) // s + 1
        out.append(n)
    return out
`,
    hint: 'Conv parameters: <code>c_out * (k * k * c_in + 1)</code>. Receptive field step: <code>rf += (k - 1) * jump</code>. Shape step: <code>n = (n + 2 * p - k) // s + 1</code>.',
    tests: [
      ['ResNet’s first layer has 9,472 parameters', `assert conv_params(3, 64, 7) == 9472`],
      ['fully connected parameters', `assert fc_params(512, 10) == 5130\nassert fc_params(3 * 32 * 32, 100) == 307300`],
      ['weight sharing: a conv layer is far smaller than a dense layer on the same image', `assert conv_params(3, 16, 3) * 100 < fc_params(3 * 32 * 32, 16 * 32 * 32)`],
      ['three 3x3 convs see 7x7 pixels', `assert receptive_field([(3, 1), (3, 1), (3, 1)]) == 7\nassert receptive_field([(7, 2), (3, 2)]) == 11`],
      ['shapes through a small network', `assert shapes(224, [(7, 2, 3), (3, 2, 1)]) == [112, 56]\nassert shapes(32, [(3, 1, 1), (2, 2, 0), (3, 1, 1), (2, 2, 0)]) == [32, 16, 16, 8]`],
    ],
  },
  {
    id: 'cv_detect', course: 'vision', title: '6 · Detection: IoU and non-maximum suppression', viz: 'nmslab',
    text: `<p>Classification says what is in the picture. <b>Detection</b> says what and <b>where</b>: a list of boxes, each with a class and a confidence. This is what lets a robot find the red cube to grasp. Detectors from the R-CNN family to YOLO and DETR produce many overlapping candidate boxes, and two small pieces of classic code turn them into a clean answer.</p>
<p><b>Intersection over union (IoU)</b> measures how much two boxes agree: the area of their overlap divided by the area of their union, from 0 (disjoint) to 1 (identical). Boxes are <code>(x1, y1, x2, y2)</code> with x1 &lt; x2 and y1 &lt; y2. IoU is also how detection is scored: a prediction usually counts as correct when its IoU with the true box is at least 0.5.</p>
<p><b>Non-maximum suppression (NMS)</b> removes duplicates: sort boxes by confidence, keep the best, throw away every remaining box whose IoU with it exceeds a threshold, and repeat with what is left.</p>
${defined('<code>math</code>. <b>You write</b> <code>iou(a, b)</code> and <code>nms(boxes, scores, thr)</code>, which returns the <b>indices</b> of the kept boxes, best first.')}
<p><b>Your task</b>: write both. The bench draws a set of overlapping candidate boxes (grey) and the ones your NMS keeps (green).</p>`,
    pre: 'import math\n',
    starter: `def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = ...
    return inter / union if union > 0 else 0.0

def nms(boxes, scores, thr):
    order = sorted(range(len(boxes)), key=lambda i: -scores[i])
    keep = []
    while order:
        best = order.pop(0)
        keep.append(best)
        order = [i for i in order if ...]      # keep only boxes that do not overlap 'best' too much
    return keep
`,
    solution: `def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0

def nms(boxes, scores, thr):
    order = sorted(range(len(boxes)), key=lambda i: -scores[i])
    keep = []
    while order:
        best = order.pop(0)
        keep.append(best)
        order = [i for i in order if iou(boxes[best], boxes[i]) <= thr]
    return keep
`,
    hint: 'Union = both areas minus the overlap you counted twice: <code>area_a + area_b - inter</code>. In NMS keep a box when <code>iou(boxes[best], boxes[i]) &lt;= thr</code>.',
    tests: [
      ['identical boxes have IoU 1, disjoint boxes 0', `assert abs(iou((0, 0, 2, 2), (0, 0, 2, 2)) - 1) < 1e-12\nassert iou((0, 0, 1, 1), (5, 5, 6, 6)) == 0`],
      ['a half-overlap', `assert abs(iou((0, 0, 2, 2), (1, 0, 3, 2)) - 1 / 3) < 1e-12`],
      ['nms keeps the best of a cluster and returns indices best first', `boxes = [(0, 0, 10, 10), (1, 1, 11, 11), (50, 50, 60, 60), (0, 1, 10, 11)]\nscores = [0.6, 0.9, 0.8, 0.7]\nassert nms(boxes, scores, 0.5) == [1, 2], nms(boxes, scores, 0.5)`],
      ['a higher threshold keeps more boxes', `boxes = [(0, 0, 10, 10), (4, 0, 14, 10)]\nscores = [0.9, 0.8]\nassert nms(boxes, scores, 0.3) == [0]\nassert nms(boxes, scores, 0.9) == [0, 1]`],
    ],
  },
  {
    id: 'cv_concepts', course: 'vision', kind: 'quiz', title: '7 · Vision concepts check',
    text: `<p>A quick check of the ideas that connect these lessons to modern robot-vision systems. Re-read the lessons above for any you miss.</p>`,
    quiz: [
      { q: 'Why does a convolutional layer have far fewer parameters than a fully connected layer on the same image?', options: ['It uses smaller numbers', 'The same small filter is reused at every position (weight sharing)', 'It ignores most of the pixels'], answer: 1 },
      { q: 'Batch normalization mainly helps because it…', options: ['makes each layer’s inputs better scaled, so training is more stable and tolerates higher learning rates', 'removes the need for a loss function', 'doubles the image resolution'], answer: 0 },
      { q: 'Your robot has only 200 labelled images of its own objects. The usual best first move is…', options: ['Train a large CNN from scratch', 'Start from a network pretrained on a large dataset and fine-tune (transfer learning)', 'Use kNN on raw pixels'], answer: 1 },
      { q: 'Which augmentation is most useful for a policy that must work when the camera is bumped a little?', options: ['Small random crops and shifts', 'Inverting every image', 'Removing the wrist camera'], answer: 0 },
      { q: 'A Vision Transformer (ViT) differs from a CNN mainly because it…', options: ['splits the image into patches and relates them with attention instead of sliding convolutions', 'cannot be pretrained', 'only works on grayscale images'], answer: 0 },
      { q: 'Many robot policies (ACT, Diffusion Policy, VLAs) start from a pretrained image backbone. What does that buy you?', options: ['Visual features learned from huge datasets, so you need far fewer robot demonstrations', 'Guaranteed zero collisions', 'Faster motors'], answer: 0 },
    ],
  },
  {
    id: 'proj_vision', course: 'vision', kind: 'read', title: '📖 CS231n roadmap and project',
    text: `<p>These six lessons are a companion, not a replacement: they re-derive the core ideas in plain Python so you can see every line. Stanford’s ${L('https://cs231n.stanford.edu/', 'CS231n')} (Convolutional Neural Networks for Visual Recognition) covers them properly, with videos and assignments, and its recent offerings run from linear classifiers up through CNNs, architectures, attention and transformers, detection and segmentation, video, and generative models. The lecture videos for the course are on YouTube and the notes are free.</p>
<h3>How the lessons map to the course</h3>
<ul><li><b>Convolution</b> and <b>CNN bookkeeping</b> → the lectures on convolutional networks and CNN architectures (batch normalization, transfer learning, AlexNet, VGG, ResNet).</li><li><b>Nearest neighbours</b> and <b>linear classifiers</b> → the first lectures (image classification, loss functions and optimization) and Assignment 1.</li><li><b>Autograd</b> → the neural networks and backpropagation lecture.</li><li><b>Detection</b> → the object detection and segmentation lecture.</li></ul>
<h3>Study plan</h3>
${'<ol><li>Do these six lessons first (about a day).</li><li>Watch the matching CS231n lectures and read the course notes.</li><li>Move to NumPy and PyTorch: the course provides review sessions and notebooks. Use a free notebook GPU for the assignments.</li><li>Do the assignments (kNN, linear classifier, a two-layer network, a ConvNet, then PyTorch). Compare your plain-Python code here with the NumPy version: same maths, much faster.</li></ol>'}
<h3>Optional project: a cube detector for your robot</h3>
<ol><li>Render 1,000 images of the pick scene from the simulation pipeline course (random layouts, lighting and camera jitter) and save the true pixel box of the red cube for each.</li><li>Fine-tune a pretrained detector or a small CNN regressor (PyTorch, on a free notebook GPU) to predict the box or the cube centre.</li><li>Evaluate with IoU on 200 held-out renders, then on a few photos of a real red block. Report the gap between sim and real.</li><li>Close the loop: convert the predicted pixel to a 3D point with your camera intrinsics and depth, and drive the arm to it.</li></ol>
<p>Stretch goals: add random backgrounds and noise (domain randomization) and measure the real-image improvement; compare ResNet and a ViT backbone; train on only 50 images and show how much pretraining helps.</p>`,
  },
];
