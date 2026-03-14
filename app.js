document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileName');
    const generateBtn = document.getElementById('generateBtn');
    const loadingState = document.getElementById('loadingState');
    const resultsPanel = document.getElementById('resultsPanel');
    const questionsContainer = document.getElementById('questionsContainer');
    const textContentInput = document.getElementById('textContent');
    const questionCountInput = document.getElementById('questionCount');

    let currentFile = null;
    let extractedText = '';
    let generatedQuestionsData = null;

    // --- Tab Switching ---
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault(); // Just in case it's in a form
            console.log('Tab clicked:', tab.dataset.tab);
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const targetId = `${tab.dataset.tab}-tab`;
            const targetElement = document.getElementById(targetId);
            console.log('Targeting element:', targetId, targetElement);
            if (targetElement) {
                targetElement.classList.add('active');
            }
        });
    });

    // --- File Drag and Drop ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
    });

    dropArea.addEventListener('drop', handleDrop, false);
    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        handleFiles(files);
    }

    async function handleFiles(files) {
        if (files.length > 0) {
            currentFile = files[0];
            fileNameDisplay.textContent = currentFile.name;
            
            if (currentFile.type === 'application/pdf') {
                extractedText = await extractTextFromPDF(currentFile);
            } else if (currentFile.type.startsWith('image/')) {
                // For images, we will pass them as base64 later
                const reader = new FileReader();
                reader.onloadend = () => {
                   extractedText = reader.result; // Base64 Data URL
                };
                reader.readAsDataURL(currentFile);
            } else {
                alert('Please upload a PDF or an Image.');
                currentFile = null;
                fileNameDisplay.textContent = '';
            }
        }
    }

    // --- PDF text extraction using PDF.js ---
    async function extractTextFromPDF(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            
            // Loop through pages
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }
            return fullText;
        } catch (error) {
            console.error('Error reading PDF:', error);
            alert('Failed to read PDF. Please try again.');
            return '';
        }
    }

    // --- Generation Logic ---
    generateBtn.addEventListener('click', async () => {

        let contentToAnalyze = '';
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        let isImage = false;

        if (activeTab === 'text') {
            contentToAnalyze = textContentInput.value.trim();
            if (!contentToAnalyze) {
                alert('Please enter some text to generate questions from.');
                return;
            }
        } else {
            if (!currentFile) {
                alert('Please upload a file.');
                return;
            }
            contentToAnalyze = extractedText;
            if(currentFile.type.startsWith('image/')) {
                isImage = true;
            }
        }

        const count = parseInt(questionCountInput.value) || 5;

        // Show loading
        loadingState.classList.remove('hidden');
        resultsPanel.classList.add('hidden');
        document.querySelector('.generator-panel').style.opacity = '0.5';
        generateBtn.disabled = true;

        try {
            const result = await callGeminiAPI(contentToAnalyze, count, isImage);
            if (result && result.questions) {
                generatedQuestionsData = result.questions;
                renderQuestions(generatedQuestionsData);
                resultsPanel.classList.remove('hidden');
                // Scroll to results
                resultsPanel.scrollIntoView({ behavior: 'smooth' });
            } else {
                alert('Oops! We couldn\'t quite make sense of the AI response right now. Please try again!');
            }
        } catch (error) {
            console.error(error);
            alert(`Oops! Something went wrong generating your quiz: ${error.message}. Please try again.`);
        } finally {
            // Hide loading
            loadingState.classList.add('hidden');
            document.querySelector('.generator-panel').style.opacity = '1';
            generateBtn.disabled = false;
        }
    });

    // --- Gemini API Caller ---
    async function callGeminiAPI(content, count, isImage) {
        const url = `/api/generate`;

        const payload = {
            content: content,
            count: count,
            isImage: isImage
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Server Request Failed');
            }

            const data = await response.json();
            return data;

        } catch(e) {
            console.error('API Call Error:', e);
            throw e;
        }
    }

    // --- Rendering Logic ---
    function renderQuestions(questions) {
        questionsContainer.innerHTML = '';
        
        questions.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'question-card';
            card.dataset.id = q.id;

            let optionsHtml = '';
            if (q.type === 'mcq' || q.type === 'tf') {
                 q.options.forEach((opt, optIndex) => {
                     const isCorrect = optIndex === q.correctAnswerIndex;
                     const optClass = isCorrect ? 'option-item correct' : 'option-item';
                     optionsHtml += `
                        <div class="${optClass}" data-index="${optIndex}">
                            <input type="radio" name="q_${q.id}" ${isCorrect ? 'checked' : ''} onchange="updateCorrectAnswer('${q.id}', ${optIndex})">
                            <input type="text" class="option-input" value="${opt.replace(/"/g, '&quot;')}" onchange="updateOptionText('${q.id}', ${optIndex}, this.value)">
                        </div>
                     `;
                 });
            }

            let questionHtml = `
                <div class="q-header">
                    <span class="q-type">${q.type === 'mcq' ? 'Multiple Choice' : 'True/False'}</span>
                    <button class="btn btn-secondary delete-btn" style="padding: 0.25rem 0.5rem; border: none; background: transparent; color: var(--danger)" onclick="deleteQuestion('${q.id}')">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
                    <span style="font-weight: 700; color: var(--primary); margin-top: 0.2rem;">${index + 1}.</span>
                    <input type="text" class="q-text" value="${q.questionText.replace(/"/g, '&quot;')}" onchange="updateQuestionText('${q.id}', this.value)">
                </div>
                <div class="options-list">
                    ${optionsHtml}
                </div>
                <div style="margin-top: 1rem; padding: 0.75rem; background: #f8fafc; border-radius: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
                    <strong>Explanation:</strong> <input type="text" value="${q.explanation ? q.explanation.replace(/"/g, '&quot;') : ''}" style="width: 100%; border: none; background: transparent; border-bottom: 1px dotted #ccc; padding: 0.2rem;" onchange="updateExplanation('${q.id}', this.value)">
                </div>
            `;

            card.innerHTML = questionHtml;
            questionsContainer.appendChild(card);
        });
        
        // Re-init newly added icons
        if(window.lucide) {
            window.lucide.createIcons();
        }
    }

    // --- Global Edit Handlers (attached to window for inline onclick/onchange) ---
    window.updateCorrectAnswer = function(qId, newIndex) {
        const q = generatedQuestionsData.find(x => x.id === qId);
        if(q) {
            q.correctAnswerIndex = newIndex;
            renderQuestions(generatedQuestionsData); // Re-render to update highlights
        }
    };

    window.updateOptionText = function(qId, optIndex, newText) {
         const q = generatedQuestionsData.find(x => x.id === qId);
        if(q) {
            q.options[optIndex] = newText;
        }
    };

    window.updateQuestionText = function(qId, newText) {
        const q = generatedQuestionsData.find(x => x.id === qId);
        if(q) {
            q.questionText = newText;
        }
    };
    
    window.updateExplanation = function(qId, newText) {
        const q = generatedQuestionsData.find(x => x.id === qId);
        if(q) {
            q.explanation = newText;
        }
    };

    window.deleteQuestion = function(qId) {
        generatedQuestionsData = generatedQuestionsData.filter(x => x.id !== qId);
        renderQuestions(generatedQuestionsData);
    };

    // --- Exporters ---
    document.getElementById('exportJsonBtn').addEventListener('click', () => {
        if(!generatedQuestionsData) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(generatedQuestionsData, null, 2));
        const dnLink = document.createElement('a');
        dnLink.setAttribute("href", dataStr);
        dnLink.setAttribute("download", "quiz_export.json");
        dnLink.click();
    });

    document.getElementById('exportTxtBtn').addEventListener('click', () => {
         if(!generatedQuestionsData) return;
         let txtContent = "AI Generated Quiz\n===================\n\n";

         generatedQuestionsData.forEach((q, i) => {
             txtContent += `${i + 1}. ${q.questionText}\n`;
             q.options.forEach((opt, idx) => {
                 const marker = idx === q.correctAnswerIndex ? '[X]' : '[ ]';
                 txtContent += `   ${String.fromCharCode(65 + idx)}) ${marker} ${opt}\n`;
             });
             txtContent += `   Explanation: ${q.explanation}\n\n`;
         });

        const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(txtContent);
        const dnLink = document.createElement('a');
        dnLink.setAttribute("href", dataStr);
        dnLink.setAttribute("download", "quiz_export.txt");
        dnLink.click();
    });
});
