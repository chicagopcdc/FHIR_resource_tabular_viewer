import React, { useState } from 'react';

     function Tabs({ generalContent, labsContent, notesContent }) {
       const [activeTab, setActiveTab] = useState('General');

       return (
         <div>
           <div className="flex border-b mb-4">
             {['General', 'Labs', 'Notes'].map(tab => (
               <button
                 key={tab}
                 className={`px-4 py-2 ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-600'}`}
                 onClick={() => setActiveTab(tab)}
               >
                 {tab}
               </button>
             ))}
           </div>
           <div>
             {activeTab === 'General' && generalContent}
             {activeTab === 'Labs' && labsContent}
             {activeTab === 'Notes' && notesContent}
           </div>
         </div>
       );
     }

     export default Tabs;